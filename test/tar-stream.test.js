'use strict';

const fs = require('fs');
const path = require('path');

const test = require('ava');
const mockFs = require('mock-fs');
const streamify = require('stream-array');
const tar = require('tar');

const TarStream = require('../lib/tar-stream');

const cwd = process.cwd();
const base = path.resolve('source-dir');
const dest = path.resolve('dest.tar');
const resdir = path.resolve('res-dir');

test.afterEach(() => mockFs.restore());

test('should create tarball with files', t => {
    mockFs({
        'source-dir': {
            'file-1.txt': 'Hi!',
            'file-2.txt': 'Hello!'
        }
    });

    return packFiles(['file-1.txt', 'file-2.txt'])
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['file-1.txt', 'file-2.txt']);
        });
});

test('should take into account contents of file', t => {
    mockFs({
        'source-dir': {
            'file-1.txt': 'Hi!'
        }
    });

    return packFiles(['file-1.txt'])
        .then(() => extractFiles(resdir))
        .then(() => {
            const str = fs.readFileSync(path.join(resdir, 'file-1.txt'), 'utf-8');

            t.is(str, 'Hi!');
        });
});

test('should create tarball with subdirs', t => {
    mockFs({
        'source-dir': {
            'sub-dir': {
                'file-1.txt': 'Hi!',
                'file-2.txt': 'Hello!'
            }
        }
    });

    return packFiles(['sub-dir/file-1.txt', 'sub-dir/file-2.txt'])
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['sub-dir/file-1.txt', 'sub-dir/file-2.txt']);
        });
});

test('should ignore directory chunk', t => {
    mockFs({
        'source-dir': {
            'file-1.txt': 'Hi!',
            'sub-dir': { 'file-2.txt': 'Hello!' }
        }
    });

    return packFiles(['file-1.txt', 'sub-dir'])
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['file-1.txt']);
        });
});

test('should take into account symlink', t => {
    mockFs({
        'file-1.txt': 'Hi!',
        'source-dir': {
            'symlink.txt': mockFs.symlink({
                path: '../file-1.txt'
            })
        }
    });

    return packFiles(['symlink.txt'])
        .then(() => extractFiles(resdir))
        .then(() => {
            fs.unlinkSync('./file-1.txt');

            const str = fs.readFileSync(path.join(resdir, 'symlink.txt'), 'utf-8');

            t.deepEqual(str, 'Hi!');
        });
});

test('should ignore broken symlinks', t => {
    mockFs({
        'source-dir': {
            'file-1.txt': 'Hi!',
            'symlink.txt': mockFs.symlink({
                path: '../no-file'
            })
        }
    });

    return packFiles(['file-1.txt', 'symlink.txt'])
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['file-1.txt']);
        });
});

test('should ignore empty file', t => {
    mockFs({
        'source-dir': {
            'empty-file.txt': mockFs.file(),
            'file-1.txt': 'Hi!'
        }
    });

    return packFiles(['empty-file.txt', 'file-1.txt'])
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['file-1.txt']);
        });
});

test('should include empty file', t => {
    mockFs({
        'source-dir': {
            'empty-file.txt': mockFs.file(),
            'file-1.txt': 'Hi!'
        }
    });

    return packFiles(['empty-file.txt', 'file-1.txt'], { emptyFiles: true })
        .then(() => extractFiles())
        .then(files => {
            t.deepEqual(files, ['empty-file.txt', 'file-1.txt']);
        });
});

test('should emit error if file file does not exist', t => {
    mockFs({
        'source-dir': {}
    });

    t.throws(packFiles(['no-file.txt']), /no such file or directory/);
});

function packFiles(filenames, options) {
    return new Promise((resolve, reject) => {
        findFiles(filenames)
            .on('error', reject)
            .pipe(new TarStream(dest, options))
            .on('error', reject)
            .on('close', resolve);
    });
}

function extractFiles(dir) {
    const files = [];

    return new Promise((resolve, reject) => {
        const rs = fs.createReadStream(dest).on('error', reject);
        const ws = dir
            ? tar.Extract({ path: dir })
            : tar.Parse().on("entry", entry => files.push(entry.props.path));

        rs.pipe(ws)
            .on('error', reject)
            .on('end', () => resolve(files));
    });
}

function findFiles(filenames) {
    const files = filenames.map(basename => {
        return { path: path.join(base, basename), base, cwd };
    });

    return streamify(files);
}
