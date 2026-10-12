/**
 * フローの JSON ファイル（flows/*.flow.json）を扱うコマンド。主に AI（Claude Code の Skill）から使う。
 *
 *   npm run flow -- list                 保存してあるフローの一覧
 *   npm run flow -- outline <フロー>     構造を 1 行ずつ表示（id・種類・見出し・線）
 *   npm run flow -- validate [--fix]     全ファイルを検査（--fix でファイル名をフロー名に合わせる）
 *   npm run flow -- layout <フロー>      画面の「自動整列」と同じ並べ方で座標を付け直して保存
 *   npm run flow -- new "<フロー名>"     空のフローを作り、ファイルのパスを表示
 *
 * <フロー> にはファイル名・ファイルのパス・フローの ID・フロー名のどれかを指定する。
 * 保存先は環境変数 FLOWCREATOR_DATA_DIR（未指定ならプロジェクト直下の flows/）。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDocument } from '../src/core/factory.ts';
import { layoutDocument, lintDocument, outlineDocument } from '../src/core/flowTools.ts';
import type { FlowDocument } from '../src/core/model.ts';
import { parseDocument } from '../src/core/schema.ts';
import { fileNameFor, FLOW_FILE_SUFFIX, flowsDir, readFlows, writeFlow, type FlowFileEntry } from '../server/flowStore.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dir = flowsDir(projectRoot);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function resolveFlow(query: string | undefined): Promise<FlowFileEntry> {
  if (!query) fail('フロー（ファイル名・パス・ID・フロー名のどれか）を指定してください');
  const entries = await readFlows(dir);
  const base = path.basename(query);
  const found =
    entries.find((e) => e.file === base) ??
    entries.find((e) => e.doc.id === query) ??
    entries.find((e) => e.doc.title === query) ??
    entries.filter((e) => e.doc.title.includes(query)).at(0);
  if (!found) fail(`フローが見つかりません: ${query}（npm run flow -- list で一覧を確認できます）`);
  return found;
}

async function list(): Promise<void> {
  const entries = (await readFlows(dir)).sort((a, b) => b.doc.updatedAt.localeCompare(a.doc.updatedAt));
  console.log(`保存先: ${dir}`);
  if (entries.length === 0) console.log('（フローはまだありません）');
  for (const { file, doc } of entries) console.log(`${doc.id}\t${doc.title}\tノード ${doc.nodes.length}\t${file}`);
}

async function validate(fix: boolean): Promise<void> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((f) => f.endsWith(FLOW_FILE_SUFFIX));
  } catch {
    fail(`保存先がありません: ${dir}`);
  }
  let errors = 0;
  const ids = new Map<string, string>();
  for (const file of names.sort()) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch {
      console.log(`✗ ${file}: JSON として読めません`);
      errors++;
      continue;
    }
    const parsed = parseDocument(json);
    if (!parsed.ok) {
      console.log(`✗ ${file}: ${parsed.error}`);
      errors++;
      continue;
    }
    const doc = parsed.doc;
    if (ids.has(doc.id)) {
      console.log(`✗ ${file}: ID ${doc.id} が ${ids.get(doc.id)} と重複しています`);
      errors++;
      continue;
    }
    ids.set(doc.id, file);
    const expected = fileNameFor(doc);
    const notes = lintDocument(doc);
    if (file !== expected) {
      if (fix) {
        await writeFlow(dir, doc);
        notes.unshift(`ファイル名を ${expected} に変更しました`);
      } else {
        notes.unshift(`ファイル名がフロー名と合っていません（${expected} にするには --fix）`);
      }
    }
    console.log(`${notes.length === 0 ? '✓' : '△'} ${file}`);
    for (const note of notes) console.log(`    - ${note}`);
  }
  if (errors > 0) fail(`\n${errors} 件のファイルに誤りがあります`);
  console.log(`\n${names.length} 件を確認しました（✓ 問題なし / △ 警告あり）`);
}

async function save(doc: FlowDocument): Promise<void> {
  const file = await writeFlow(dir, doc);
  console.log(path.join(dir, file));
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case 'list':
    await list();
    break;
  case 'outline':
    console.log(outlineDocument((await resolveFlow(args[0])).doc));
    break;
  case 'validate':
    await validate(args.includes('--fix'));
    break;
  case 'layout': {
    const entry = await resolveFlow(args[0]);
    await save(layoutDocument(entry.doc));
    break;
  }
  case 'new':
    if (!args[0]) fail('フロー名を指定してください');
    await save(createDocument(args[0]));
    break;
  default:
    console.log(`使い方:
  npm run flow -- list                 保存してあるフローの一覧
  npm run flow -- outline <フロー>     構造を 1 行ずつ表示
  npm run flow -- validate [--fix]     全ファイルを検査（--fix でファイル名をフロー名に合わせる）
  npm run flow -- layout <フロー>      自動整列して保存
  npm run flow -- new "<フロー名>"     空のフローを作る`);
}
