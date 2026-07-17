const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Bundles the extension and uninstall-hook entry points with esbuild.
 */
async function main()
{
	const ctx = await esbuild.context({
		entryPoints: {
			extension: "src/extension.ts",
			uninstall: "src/uninstall.ts",
		},
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "node",
		outdir: "dist",
		external: ["vscode"],
		logLevel: "info",
	});

	if (watch)
	{
		await ctx.watch();
	}
	else
	{
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((err) =>
{
	console.error(err);
	process.exit(1);
});
