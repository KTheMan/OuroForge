#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateRustFiles } from '../src/contract/rustGenerator';

interface CliOptions {
    manifest: string;
    outDir: string;
    check: boolean;
}

function usage(): never {
    throw new Error('Usage: ouroforge-rust --manifest <manifest.json> --out-dir <directory> [--check]');
}

function parseArgs(args: string[]): CliOptions {
    let manifest = '';
    let outDir = '';
    let check = false;
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--manifest') manifest = args[++index] || '';
        else if (arg === '--out-dir') outDir = args[++index] || '';
        else if (arg === '--check') check = true;
        else usage();
    }
    if (!manifest || !outDir) usage();
    return { manifest: resolve(manifest), outDir: resolve(outDir), check };
}

async function sameContents(path: string, expected: string): Promise<boolean> {
    try {
        return await readFile(path, 'utf8') === expected;
    } catch {
        return false;
    }
}

async function writeOwnedFile(path: string, contents: string): Promise<void> {
    // Filename comes only from generateRustFiles, never from the manifest.
    const temporary = `${path}.tmp-${process.pid}`;
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, path);
}

export async function run(args: string[]): Promise<number> {
    const options = parseArgs(args);
    const input = JSON.parse(await readFile(options.manifest, 'utf8')) as unknown;
    const files = generateRustFiles(input);
    if (!options.check) await mkdir(options.outDir, { recursive: true });

    let stale = false;
    for (const [filename, contents] of Object.entries(files)) {
        // Defense in depth: the generator contract must never return a path.
        if (basename(filename) !== filename) throw new Error(`Unsafe generated filename: ${filename}`);
        const target = join(options.outDir, filename);
        if (options.check) stale ||= !(await sameContents(target, contents));
        else await writeOwnedFile(target, contents);
    }
    if (stale) {
        process.stderr.write('Generated Ouroboros files are stale. Run without --check.\n');
        return 1;
    }
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run(process.argv.slice(2)).then(
        (code) => { process.exitCode = code; },
        (error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        },
    );
}
