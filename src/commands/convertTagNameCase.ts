import { hyphenate } from '@vue/shared';
import * as vscode from 'vscode-languageserver';
import type { ApiLanguageServiceContext } from '../types';
import * as references from '../services/references';

export function register(context: ApiLanguageServiceContext) {

	const findReferences = references.register(context);

	return async (
		connection: vscode.Connection,
		{ sourceFiles }: ApiLanguageServiceContext,
		uri: string,
		mode: 'kebab' | 'pascal',
	) => {

		const sourceFile = sourceFiles.get(uri);
		if (!sourceFile)
			return;

		const desc = sourceFile.getDescriptor();
		if (!desc.template)
			return;

		const progress = await connection.window.createWorkDoneProgress();
		progress.begin('Convert Tag Name', 0, '', true);

		const template = desc.template;
		const document = sourceFile.getTextDocument();
		const edits: vscode.TextEdit[] = [];
		const components = new Set(sourceFile.getTemplateScriptData().components);
		const resolvedTags = sourceFile.refs.sfcTemplateScript.templateCodeGens.value?.tagNames ?? {};
		let i = 0;

		for (const tagName in resolvedTags) {
			const resolvedTag = resolvedTags[tagName];
			if (resolvedTag?.offsets.length) {

				if (progress.token.isCancellationRequested)
					return;

				progress.report(i++ / Object.keys(resolvedTags).length * 100, tagName);

				const offset = template.startTagEnd + resolvedTag.offsets[0];
				const refs = findReferences(uri, sourceFile.getTextDocument().positionAt(offset));

				for (const vueLoc of refs) {
					if (
						vueLoc.uri === sourceFile.uri
						&& document.offsetAt(vueLoc.range.start) >= template.startTagEnd
						&& document.offsetAt(vueLoc.range.end) <= template.startTagEnd + template.content.length
					) {
						const referenceText = document.getText(vueLoc.range);
						for (const component of components) {
							if (component === referenceText || hyphenate(component) === referenceText) {
								if (mode === 'kebab' && referenceText !== hyphenate(component)) {
									edits.push(vscode.TextEdit.replace(vueLoc.range, hyphenate(component)));
								}
								if (mode === 'pascal' && referenceText !== component) {
									edits.push(vscode.TextEdit.replace(vueLoc.range, component));
								}
							}
						}
					}
				}
			}
		}

		connection.workspace.applyEdit({ changes: { [document.uri]: edits } });
		progress.done();
	}
}
