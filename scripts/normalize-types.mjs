// F29: prints a TypeScript file's declarations without comments, in the
// compiler's own formatting, with `.ts` import extensions dropped. Two files
// that differ only in comments, formatting (deno fmt vs prettier) or import
// extensions print the same. Used by check-type-sync.sh, through
// scripts/diff-normalized.mjs, and still runnable on its own.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function normalize(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  const dropTsExtension = (context) => (root) => {
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.endsWith(".ts")
      ) {
        const specifier = context.factory.createStringLiteral(
          node.moduleSpecifier.text.slice(0, -3),
        );
        return ts.isImportDeclaration(node)
          ? context.factory.updateImportDeclaration(
              node,
              node.modifiers,
              node.importClause,
              specifier,
              node.attributes,
            )
          : context.factory.updateExportDeclaration(
              node,
              node.modifiers,
              node.isTypeOnly,
              node.exportClause,
              specifier,
              node.attributes,
            );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(root, visit);
  };

  const [transformed] = ts.transform(source, [dropTsExtension]).transformed;
  const printer = ts.createPrinter({ removeComments: true });
  return printer.printFile(transformed);
}

// Still a script: `node scripts/normalize-types.mjs <file>`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(normalize(process.argv[2]));
}
