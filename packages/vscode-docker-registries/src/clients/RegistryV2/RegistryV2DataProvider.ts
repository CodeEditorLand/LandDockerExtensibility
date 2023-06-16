/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommonRegistryDataProvider } from '../common/CommonRegistryDataProvider';
import { CommonRegistry, CommonRegistryItem, CommonRegistryRoot, CommonRepository, CommonTag } from '../common/models';
import { AuthenticationProvider } from '../../contracts/AuthenticationProvider';
import { LoginInformation } from '../../contracts/BasicCredentials';
import { registryV2Request } from './registryV2Request';

export interface V2RegistryItem extends CommonRegistryItem {
    readonly registryRootUri: vscode.Uri;
}

export type V2RegistryRoot = CommonRegistryRoot & V2RegistryItem;
export type V2Registry = CommonRegistry & V2RegistryItem;
export type V2Repository = CommonRepository & V2RegistryItem;
export type V2Tag = CommonTag & V2RegistryItem;

export abstract class RegistryV2DataProvider extends CommonRegistryDataProvider {
    public constructor(
        public readonly label: string,
        private readonly authenticationProvider: AuthenticationProvider,
        public readonly description?: string,
        public readonly icon?: vscode.ThemeIcon,
    ) {
        super();
    }

    public abstract getRegistries(root: V2RegistryRoot): V2Registry[] | Promise<V2Registry[]>;

    public async getRepositories(registry: V2Registry): Promise<V2Repository[]> {
        const catalogResponse = await registryV2Request<{ repositories: string[] }>({
            authenticationProvider: this.authenticationProvider,
            method: 'GET',
            registryRootUri: registry.registryRootUri,
            path: ['v2', '_catalog'],
            scopes: ['registry:catalog:*']
        });

        const results: V2Repository[] = [];

        for (const repository of catalogResponse.body?.repositories || []) {
            results.push({
                registryRootUri: registry.registryRootUri,
                label: repository,
                parent: registry,
                type: 'commonrepository',
            });
        }

        return results;
    }

    public async getTags(repository: V2Repository): Promise<V2Tag[]> {
        const tagsResponse = await registryV2Request<{ tags: string[] }>({
            authenticationProvider: this.authenticationProvider,
            method: 'GET',
            registryRootUri: repository.registryRootUri,
            path: ['v2', repository.label, 'tags', 'list'],
            scopes: [`repository:${repository.label}:'pull'`]
        });

        const results: V2Tag[] = [];

        for (const tag of tagsResponse.body?.tags || []) {
            results.push({
                registryRootUri: repository.registryRootUri,
                label: tag,
                parent: repository,
                type: 'commontag',
            });
        }

        return results;
    }

    public getLoginInformation(): LoginInformation {
        throw new Error('TODO: Not implemented');
    }

    public async onDisconnect(): Promise<void> {
        if (this.authenticationProvider.onDisconnect) {
            return await this.authenticationProvider.onDisconnect();
        }
    }
}
