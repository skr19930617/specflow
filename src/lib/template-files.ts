export interface TemplateFileAlias {
	readonly logicalPath: string;
	readonly packagedPath: string;
}

export const templateFileAliases: readonly TemplateFileAlias[] = [
	{
		logicalPath: "template/.gitignore",
		packagedPath: "template/_gitignore",
	},
	{
		logicalPath: "template/.specflow/config.env",
		packagedPath: "template/_specflow/config.env",
	},
	{
		logicalPath: "template/.specflow/config.yaml",
		packagedPath: "template/_specflow/config.yaml",
	},
];

export function packagedTemplatePathFor(logicalPath: string): string | null {
	return (
		templateFileAliases.find((alias) => alias.logicalPath === logicalPath)
			?.packagedPath ?? null
	);
}
