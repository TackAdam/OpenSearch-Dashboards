/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDataSourceReference } from '../../../common/index_patterns/utils';
import { SavedObject } from '../../../../../core/public';
import {
  IndexPatternSavedObjectAttrs,
  IndexPatternsContract,
} from '../../index_patterns/index_patterns';
import { DataSource, IndexPatternOption } from '../datasource';
import {
  IDataSetParams,
  IDataSourceDataSet,
  IDataSourceMetadata,
  IDataSourceQueryParams,
  IDataSourceQueryResponse,
  IDataSourceSettings,
} from '../datasource/types';

export type LocalDSMetadata = IDataSourceMetadata;
export type LocalDSDataSetParams = IDataSetParams;
export type LocalDSDataSetResponse = IDataSourceDataSet<IndexPatternOption[]>;
export type LocalDSQueryParams = IDataSourceQueryParams;
export type LocalDSQueryResponse = IDataSourceQueryResponse;
export interface LocalDataSourceSettings extends IDataSourceSettings {
  indexPatterns: IndexPatternsContract;
}

export class DefaultDslDataSource extends DataSource<
  LocalDSMetadata,
  LocalDSDataSetParams,
  LocalDSDataSetResponse,
  LocalDSQueryParams,
  LocalDSQueryResponse
> {
  private readonly indexPatterns: IndexPatternsContract;

  constructor({ id, name, type, metadata, indexPatterns }: LocalDataSourceSettings) {
    super({ id, name, type, metadata });
    this.indexPatterns = indexPatterns;
  }

  async getDataSet(): Promise<LocalDSDataSetResponse> {
    await this.indexPatterns.ensureDefaultIndexPattern();
    const savedObjectLst = await this.indexPatterns.getCache();

    if (!Array.isArray(savedObjectLst)) {
      return { dataSets: [] };
    }

    return {
      dataSets: savedObjectLst.map((savedObject: SavedObject<IndexPatternSavedObjectAttrs>) => {
        const dataSet: any = {
          id: savedObject.id,
          title: savedObject.attributes.title,
          // @ts-expect-error TS2345 TODO(ts-error): fixme
          dataSourceId: getDataSourceReference(savedObject.references)?.id,
        };

        // Only include displayName if it has a value
        if (savedObject.attributes.displayName) {
          dataSet.displayName = savedObject.attributes.displayName;
        }

        return dataSet;
      }),
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async runQuery(): Promise<LocalDSQueryResponse> {
    return {
      data: {},
    };
  }
}
