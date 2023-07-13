/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProvider } from '../contracts/AuthenticationProvider';
import { BasicCredentials } from '../contracts/BasicCredentials';
import { RequestLike, httpRequest } from '../utils/httpRequest';

export interface BasicOAuthOptions extends vscode.AuthenticationGetSessionOptions {
    readonly service: vscode.Uri;
}

export class BasicOAuthProvider<TOptions extends BasicOAuthOptions> implements AuthenticationProvider<TOptions | undefined> {
    private oAuthEndpoint: string | undefined;
    private oAuthService: string | undefined;
    private defaultScopes: string[] | undefined;
    private _didFallback: boolean = false;

    public constructor(private readonly storageMemento: vscode.Memento, private readonly secretStorage: vscode.SecretStorage, private readonly storageKey: string) { }

    public async getSession(scopes: string[], options?: TOptions): Promise<vscode.AuthenticationSession & { type: string }> {
        const { username, secret } = await this.getBasicCredentials();

        if (this.oAuthEndpoint === undefined || this.oAuthService === undefined) {
            return {
                id: 'basic',
                type: 'Basic',
                account: {
                    label: username,
                    id: username,
                },
                accessToken: this.getBasicAuthToken(username, secret),
                scopes: scopes,
            };
        } else {
            const request: RequestLike = {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${this.getBasicAuthToken(username, secret)}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'grant_type': 'password',
                    'service': this.oAuthService,
                    'scope': [...this.defaultScopes ?? [], ...scopes].join(' '),
                },
            };

            const oAuthResponse = await httpRequest<{ token: string }>(this.oAuthEndpoint.toString(), request);

            return {
                id: 'oauth',
                type: 'Bearer',
                account: {
                    label: username,
                    id: username,
                },
                accessToken: (await oAuthResponse.json()).token,
                scopes: scopes,
            };

        }
    }

    public async removeSession(sessionId?: string): Promise<void> {
        throw new Error('TODO: Method not implemented.');
    }

    public fallback(wwwAuthenticateHeader: string): void {
        const wwwAuthenticateHeaderRegex = /Bearer\s+realm="(?<realm>[^"]+)",\s*service="(?<service>[^"]+)",\s*scope="(?<scope>[^"]+)"/i;

        const match = wwwAuthenticateHeaderRegex.exec(wwwAuthenticateHeader);

        if (!match?.groups?.realm || !match?.groups?.service || !match?.groups?.scope) {
            throw new Error(vscode.l10n.t('Unable to parse WWW-Authenticate header: "{0}"', wwwAuthenticateHeader));
        }

        this.oAuthEndpoint = match.groups.realm;
        this.oAuthService = match.groups.service;
        this.defaultScopes = match.groups.scope.split(' ');
        this._didFallback = true;
    }

    public get didFallback(): boolean {
        return this._didFallback;
    }

    public async getBasicCredentials(): Promise<BasicCredentials> {
        const username = this.storageMemento.get<string>(`${this.storageKey}.username`);
        const secret = await this.secretStorage.get(`${this.storageKey}.secret`);

        if (!username) {
            throw new Error(vscode.l10n.t('Could not load username for {0}', this.storageKey));
        } else if (secret === undefined || secret === null) {
            // An empty string is allowed as a secret (but obviously not advisable)
            throw new Error(vscode.l10n.t('Could not load secret for {0}', this.storageKey));
        }

        return {
            username,
            secret,
        };
    }

    private getBasicAuthToken(username: string, secret: string): string {
        return Buffer.from(`${username}:${secret}`).toString('base64');
    }
}

export function isBasicOAuthProvider(maybeProvider: unknown): maybeProvider is BasicOAuthProvider<never> {
    return maybeProvider instanceof BasicOAuthProvider;
}
