/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from '@angular-devkit/core';
import {
    Rule,
    SchematicsException,
    Tree,
    apply,
    applyTemplates,
    branchAndMerge,
    chain,
    filter,
    mergeWith,
    move,
    noop,
    url,
} from '@angular-devkit/schematics';
import * as ts from 'typescript';
import {
    addDeclarationToModule,
    addEntryComponentToModule,
    addExportToModule,
} from '../utility/ast-utils';
import { InsertChange } from '../utility/change';
import { buildRelativePath, findModuleFromOptions } from '../utility/find-module';
import { applyLintFix } from '../utility/lint-fix';
import { parseName } from '../utility/parse-name';
import { buildDefaultPath, getProject } from '../utility/project';
import { validateHtmlSelector, validateName } from '../utility/validation';
import { Schema as ComponentOptions } from './schema';

function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
    const text = host.read(modulePath);
    if (text === null) {
        throw new SchematicsException(`File ${modulePath} does not exist.`);
    }
    const sourceText = text.toString('utf-8');

    return ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);
}

function addDeclarationToNgModule(options: ComponentOptions): Rule {
    return (host: Tree) => {
        if (options.skipImport || !options.module) {
            return host;
        }

        const modulePath = options.module;
        const source = readIntoSourceFile(host, modulePath);

        const componentPath = `/${options.path}/`
            + (options.flat ? '' : strings.dasherize(options.name) + '/')
            + strings.dasherize(options.name)
            + '.component';
        const relativePath = buildRelativePath(modulePath, componentPath);
        const classifiedName = strings.classify(`${options.name}Component`);
        const declarationChanges = addDeclarationToModule(source,
            modulePath,
            classifiedName,
            relativePath);

        const declarationRecorder = host.beginUpdate(modulePath);
        for (const change of declarationChanges) {
            if (change instanceof InsertChange) {
                declarationRecorder.insertLeft(change.pos, change.toAdd);
            }
        }
        host.commitUpdate(declarationRecorder);

        if (options.export) {
            // Need to refresh the AST because we overwrote the file in the host.
            const source = readIntoSourceFile(host, modulePath);

            const exportRecorder = host.beginUpdate(modulePath);
            const exportChanges = addExportToModule(source, modulePath,
                strings.classify(`${options.name}Component`),
                relativePath);

            for (const change of exportChanges) {
                if (change instanceof InsertChange) {
                    exportRecorder.insertLeft(change.pos, change.toAdd);
                }
            }
            host.commitUpdate(exportRecorder);
        }

        if (options.entryComponent) {
            // Need to refresh the AST because we overwrote the file in the host.
            const source = readIntoSourceFile(host, modulePath);

            const entryComponentRecorder = host.beginUpdate(modulePath);
            const entryComponentChanges = addEntryComponentToModule(
                source, modulePath,
                strings.classify(`${options.name}Component`),
                relativePath);

            for (const change of entryComponentChanges) {
                if (change instanceof InsertChange) {
                    entryComponentRecorder.insertLeft(change.pos, change.toAdd);
                }
            }
            host.commitUpdate(entryComponentRecorder);
        }


        return host;
    };
}


function buildSelector(options: ComponentOptions, projectPrefix: string) {
    let selector = strings.dasherize(options.name);
    if (options.prefix) {
        selector = `${options.prefix}-${selector}`;
    } else if (options.prefix === undefined && projectPrefix) {
        selector = `${projectPrefix}-${selector}`;
    }

    return selector;
}


export default function (options: ComponentOptions): Rule {
    return (host: Tree) => {
        if (!options.project) {
            throw new SchematicsException('Option (project) is required.');
        }
        const project = getProject(host, options.project);

        if (options.path === undefined) {
            options.path = buildDefaultPath(project);
        }

        options.module = findModuleFromOptions(host, options);

        const parsedPath = parseName(options.path, options.name);
        options.name = parsedPath.name;
        options.path = parsedPath.path;
        options.selector = options.selector || buildSelector(options, project.prefix);

        // todo remove these when we remove the deprecations
        options.style = (
            options.style && options.style !== 'css'
                ? options.style : options.styleext as string
        ) || 'css';
        options.skipTests = options.skipTests || !options.spec;

        validateName(options.name);
        validateHtmlSelector(options.selector);

        const templateSource = apply(url('./files'), [
            options.skipTests ? filter(path => !path.endsWith('.spec.ts.template')) : noop(),
            options.inlineStyle ? filter(path => !path.endsWith('.__styleExt__.template')) : noop(),
            options.inlineTemplate ? filter(path => !path.endsWith('.html.template')) : noop(),
            applyTemplates({
                ...strings,
                'if-flat': (s: string) => options.flat ? '' : s,
                ...options,
                styleExt: styleToFileExtention(options.style),
            }),
            move(parsedPath.path),
        ]);

        return chain([
            branchAndMerge(chain([
                addDeclarationToNgModule(options),
                mergeWith(templateSource),
            ])),
            options.lintFix ? applyLintFix(options.path) : noop(),
        ]);
    };
}

export function styleToFileExtention(style: string | undefined): string {
    switch (style) {
        case 'sass':
            return 'scss';
        default:
            return style || 'css';
    }
}