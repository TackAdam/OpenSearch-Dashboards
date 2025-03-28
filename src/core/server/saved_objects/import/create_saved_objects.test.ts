/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { savedObjectsClientMock } from '../../mocks';
import { createSavedObjects } from './create_saved_objects';
import { SavedObjectsClientContract, SavedObject, SavedObjectsImportError } from '../types';
import { SavedObjectsErrorHelpers } from '..';
import { extractErrors } from './extract_errors';

type CreateSavedObjectsParams = Parameters<typeof createSavedObjects>[0];

/**
 * Function to create a realistic-looking import object given a type, ID, and optional originId
 */
const createObject = (type: string, id: string, originId?: string): SavedObject => ({
  type,
  id,
  attributes: {},
  references: [
    { name: 'name-1', type: 'other-type', id: 'other-id' }, // object that is not present
    { name: 'name-2', type: MULTI_NS_TYPE, id: 'id-1' }, // object that is present, but does not have an importIdMap entry
    { name: 'name-3', type: MULTI_NS_TYPE, id: 'id-3' }, // object that is present and has an importIdMap entry
  ],
  ...(originId && { originId }),
});

const MULTI_NS_TYPE = 'multi';
const OTHER_TYPE = 'other';
const DATA_SOURCE = 'data-source';

/**
 * Create a variety of different objects to exercise different import / result scenarios
 */
const obj1 = createObject(MULTI_NS_TYPE, 'id-1', 'originId-a'); // -> success
const obj2 = createObject(MULTI_NS_TYPE, 'id-2', 'originId-b'); // -> conflict
const obj3 = createObject(MULTI_NS_TYPE, 'id-3', 'originId-c'); // -> conflict (with known importId and omitOriginId=true)
const obj4 = createObject(MULTI_NS_TYPE, 'id-4', 'originId-d'); // -> conflict (with known importId)
const obj5 = createObject(MULTI_NS_TYPE, 'id-5', 'originId-e'); // -> unresolvable conflict
const obj6 = createObject(MULTI_NS_TYPE, 'id-6'); // -> success
const obj7 = createObject(MULTI_NS_TYPE, 'id-7'); // -> conflict
const obj8 = createObject(MULTI_NS_TYPE, 'id-8'); // -> conflict (with known importId)
const obj9 = createObject(MULTI_NS_TYPE, 'id-9'); // -> unresolvable conflict
const obj10 = createObject(OTHER_TYPE, 'id-10', 'originId-f'); // -> success
const obj11 = createObject(OTHER_TYPE, 'id-11', 'originId-g'); // -> conflict
const obj12 = createObject(OTHER_TYPE, 'id-12'); // -> success
const obj13 = createObject(OTHER_TYPE, 'id-13'); // -> conflict
// data source object
const dataSourceObj1 = createObject(DATA_SOURCE, 'ds-id1'); // -> success
const dataSourceObj2 = createObject(DATA_SOURCE, 'ds-id2'); // -> conflict
const dashboardObjWithDataSource = createObject('dashboard', 'ds_dashboard-id1'); // -> success
const visualizationObjWithDataSource = createObject('visualization', 'ds_visualization-id1'); // -> success
visualizationObjWithDataSource.attributes = { visState: '{}' };
const searchObjWithDataSource = createObject('search', 'ds_search-id1'); // -> success

// objs without data source id, used to test can get saved object with data source id
const searchObj = {
  id: '6aea5700-ac94-11e8-a651-614b2788174a',
  type: 'search',
  attributes: {
    title: 'some-title',
  },
  references: [],
  source: {
    title: 'mysavedsearch',
    kibanaSavedObjectMeta: {
      searchSourceJSON:
        '{"index":"4c3f3c30-ac94-11e8-a651-614b2788174a","highlightAll":true,"version":true,"query":{"query":"","language":"lucene"},"filter":[]}',
    },
  },
}; // -> success

const visualizationObj = {
  id: '8411daa0-ac94-11e8-a651-614b2788174a',
  type: 'visualization',
  attributes: {
    title: 'visualization-title',
    visState: '{}',
  },
  references: [],
  source: {
    title: 'mysavedviz',
    visState:
      '{"title":"mysavedviz","type":"pie","params":{"type":"pie","addTooltip":true,"addLegend":true,"legendPosition":"right","isDonut":true,"labels":{"show":false,"values":true,"last_level":true,"truncate":100}},"aggs":[{"id":"1","enabled":true,"type":"count","schema":"metric","params":{}}]}',
    uiStateJSON: '{}',
    description: '',
    savedSearchId: '6aea5700-ac94-11e8-a651-614b2788174a',
    version: 1,
    kibanaSavedObjectMeta: {
      searchSourceJSON: '{"query":{"query":"","language":"lucene"},"filter":[]}',
    },
  },
};

const getVegaVisualizationObj = (id: string) => ({
  type: 'visualization',
  id,
  attributes: {
    title: 'some-title',
    visState:
      '{"title":"some-title","type":"vega","aggs":[],"params":{"spec":"{\\n  data: {\\n    url: {\\n      index: example_index\\n    }\\n  }\\n}"}}',
  },
  references: [],
  namespaces: ['default'],
  version: 'some-version',
  updated_at: 'some-date',
});

const getTSVBVisualizationObj = (id: string, dataSourceId?: string) => {
  const params = dataSourceId ? { data_source_id: dataSourceId } : {};
  const references = dataSourceId
    ? [{ id: dataSourceId, name: 'dataSource', type: 'data-source' }]
    : [];
  return {
    type: 'visualization',
    id,
    attributes: {
      title: 'some-title',
      visState: JSON.stringify({
        type: 'metrics',
        params,
      }),
    },
    references,
    namespaces: ['default'],
    updated_at: 'some-date',
  };
};

const getVegaMDSVisualizationObj = (id: string, dataSourceId: string) => ({
  type: 'visualization',
  id: dataSourceId ? `${dataSourceId}_${id}` : id,
  attributes: {
    title: 'some-other-title',
    visState:
      '{"title":"some-other-title","type":"vega","aggs":[],"params":{"spec":"{\\n  data: {\\n    url: {\\n      index: example_index\\n      data_source_name: old-datasource-title\\n    }\\n  }\\n}"}}',
  },
  references: [
    {
      id: dataSourceId,
      name: 'dataSource',
      type: 'data-source',
    },
  ],
});

const getTimelineVisualizationObj = (id: string, dataSourceId: string) => ({
  type: 'visualization',
  id: dataSourceId ? `${dataSourceId}_${id}` : id,
  attributes: {
    title: 'some-other-title',
    visState:
      '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp)"},"aggs":[]}',
  },
  references: [],
});

const getTimelineVisualizationObjWithMultipleQueries = (id: string, dataSourceId: string) => ({
  type: 'visualization',
  id: dataSourceId ? `${dataSourceId}_${id}` : id,
  attributes: {
    title: 'some-other-title',
    visState:
      '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp, data_source_name=\\"aos 211\\"), .elasticsearch(index=old-datasource-title, timefield=@timestamp)"},"aggs":[]}',
  },
  references: [],
});

const getTimelineVisualizationObjWithDataSourceName = (id: string, dataSourceId: string) => ({
  type: 'visualization',
  id: dataSourceId ? `${dataSourceId}_${id}` : id,
  attributes: {
    title: 'some-other-title',
    visState:
      '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp, data_source_name=ds1)"},"aggs":[]}',
  },
  references: [],
});
// non-multi-namespace types shouldn't have origin IDs, but we include test cases to ensure it's handled gracefully
// non-multi-namespace types by definition cannot result in an unresolvable conflict, so we don't include test cases for those
const importId3 = 'id-foo';
const importId4 = 'id-bar';
const importId8 = 'id-baz';

const importIdMap = new Map([
  [`${obj3.type}:${obj3.id}`, { id: importId3, omitOriginId: true }],
  [`${obj4.type}:${obj4.id}`, { id: importId4 }],
  [`${obj8.type}:${obj8.id}`, { id: importId8 }],
]);

describe('#createSavedObjects', () => {
  let savedObjectsClient: jest.Mocked<SavedObjectsClientContract>;
  let bulkCreate: typeof savedObjectsClient['bulkCreate'];

  /**
   * Creates an options object to be used as an argument for createSavedObjects
   * Includes mock savedObjectsClient
   */
  const setupParams = (partial: {
    objects: SavedObject[];
    accumulatedErrors?: SavedObjectsImportError[];
    namespace?: string;
    overwrite?: boolean;
    dataSourceId?: string;
    dataSourceTitle?: string;
    savedObjectsCustomClient?: jest.Mocked<SavedObjectsClientContract>;
  }): CreateSavedObjectsParams => {
    savedObjectsClient = !!partial.savedObjectsCustomClient
      ? partial.savedObjectsCustomClient
      : savedObjectsClientMock.create();
    bulkCreate = savedObjectsClient.bulkCreate;
    return { accumulatedErrors: [], ...partial, savedObjectsClient, importIdMap };
  };

  const getExpectedBulkCreateArgsObjects = (objects: SavedObject[], retry?: boolean) =>
    objects.map(({ type, id, attributes, originId }) => ({
      type,
      id: retry ? `new-id-for-${id}` : id, // if this was a retry, we regenerated the id -- this is mocked below
      attributes,
      references: [
        { name: 'name-1', type: 'other-type', id: 'other-id' }, // object that is not present
        { name: 'name-2', type: MULTI_NS_TYPE, id: 'id-1' }, // object that is present, but does not have an importIdMap entry
        { name: 'name-3', type: MULTI_NS_TYPE, id: 'id-foo' }, // object that is present and has an importIdMap entry
      ],
      // if the import object had an originId, and/or if we regenerated the id, expect an originId to be included in the create args
      ...((originId || retry) && { originId: originId || id }),
    }));

  const expectBulkCreateArgs = {
    objects: (n: number, objects: SavedObject[], retry?: boolean) => {
      const expectedObjects = getExpectedBulkCreateArgsObjects(objects, retry);
      const expectedOptions = expect.any(Object);
      expect(bulkCreate).toHaveBeenNthCalledWith(n, expectedObjects, expectedOptions);
    },
    options: (n: number, options: CreateSavedObjectsParams) => {
      const expectedObjects = expect.any(Array);
      const expectedOptions = { namespace: options.namespace, overwrite: options.overwrite };
      expect(bulkCreate).toHaveBeenNthCalledWith(n, expectedObjects, expectedOptions);
    },
  };

  const getResultMock = {
    success: (
      { type, id, attributes, references, originId }: SavedObject,
      { namespace }: CreateSavedObjectsParams
    ): SavedObject => ({
      type,
      id,
      attributes,
      references,
      ...(originId && { originId }),
      version: 'some-version',
      updated_at: 'some-date',
      namespaces: [namespace ?? 'default'],
    }),
    conflict: (type: string, id: string) => {
      const error = SavedObjectsErrorHelpers.createConflictError(type, id).output.payload;
      return ({ type, id, error } as unknown) as SavedObject;
    },
    unresolvableConflict: (type: string, id: string) => {
      const conflictMock = getResultMock.conflict(type, id);
      conflictMock.error!.metadata = { isNotOverwritable: true };
      return conflictMock;
    },
  };

  /**
   * Remap the bulkCreate results to ensure that each returned object reflects the ID of the imported object.
   * This is needed because createSavedObjects may change the ID of the object to create, but this process is opaque to consumers of the
   * API; we have to remap IDs of results so consumers can act upon them, as there is no guarantee that results will be returned in the same
   * order as they were imported in.
   * For the purposes of this test suite, the objects ARE guaranteed to be in the same order, so we do a simple loop to remap the IDs.
   * In addition, extract the errors out of the created objects -- since we are testing with realistic objects/errors, we can use the real
   * `extractErrors` module to do so.
   */
  const getExpectedResults = (resultObjects: SavedObject[], objects: SavedObject[]) => {
    const remappedResults = resultObjects.map((result, i) => ({ ...result, id: objects[i].id }));
    return {
      createdObjects: remappedResults.filter((obj) => !obj.error),
      errors: extractErrors(remappedResults, objects),
    };
  };

  test('filters out objects that have errors present', async () => {
    const error = { type: obj1.type, id: obj1.id } as SavedObjectsImportError;
    const options = setupParams({ objects: [obj1], accumulatedErrors: [error] });

    const createSavedObjectsResult = await createSavedObjects(options);
    expect(bulkCreate).not.toHaveBeenCalled();
    expect(createSavedObjectsResult).toEqual({ createdObjects: [], errors: [] });
  });

  test('filters out objects that have errors present with data source', async () => {
    const error = { type: dataSourceObj1.type, id: dataSourceObj1.id } as SavedObjectsImportError;
    const options = setupParams({ objects: [dataSourceObj1], accumulatedErrors: [error] });

    const createSavedObjectsResult = await createSavedObjects(options);
    expect(bulkCreate).not.toHaveBeenCalled();
    expect(createSavedObjectsResult).toEqual({ createdObjects: [], errors: [] });
  });

  test('exits early if there are no objects to create', async () => {
    const options = setupParams({ objects: [] });

    const createSavedObjectsResult = await createSavedObjects(options);
    expect(bulkCreate).not.toHaveBeenCalled();
    expect(createSavedObjectsResult).toEqual({ createdObjects: [], errors: [] });
  });

  const objs = [obj1, obj2, obj3, obj4, obj5, obj6, obj7, obj8, obj9, obj10, obj11, obj12, obj13];
  const dataSourceObjs = [
    dataSourceObj1,
    dataSourceObj2,
    dashboardObjWithDataSource,
    visualizationObjWithDataSource,
    searchObjWithDataSource,
  ];

  const setupMockResults = (options: CreateSavedObjectsParams) => {
    bulkCreate.mockResolvedValue({
      saved_objects: [
        getResultMock.success(obj1, options),
        getResultMock.conflict(obj2.type, obj2.id),
        getResultMock.conflict(obj3.type, importId3),
        getResultMock.conflict(obj4.type, importId4),
        getResultMock.unresolvableConflict(obj5.type, obj5.id),
        getResultMock.success(obj6, options),
        getResultMock.conflict(obj7.type, obj7.id),
        getResultMock.conflict(obj8.type, importId8),
        getResultMock.unresolvableConflict(obj9.type, obj9.id),
        getResultMock.success(obj10, options),
        getResultMock.conflict(obj11.type, obj11.id),
        getResultMock.success(obj12, options),
        getResultMock.conflict(obj13.type, obj13.id),
      ],
    });
  };

  const setupMockResultsWithDataSource = (options: CreateSavedObjectsParams) => {
    bulkCreate.mockResolvedValue({
      saved_objects: [
        getResultMock.conflict(dataSourceObj1.type, dataSourceObj1.id),
        getResultMock.success(dataSourceObj2, options),
        getResultMock.success(dashboardObjWithDataSource, options),
        getResultMock.success(visualizationObjWithDataSource, options),
        getResultMock.success(searchObjWithDataSource, options),
      ],
    });
  };
  const setupMockResultsToConstructDataSource = (options: CreateSavedObjectsParams) => {
    bulkCreate.mockResolvedValue({
      saved_objects: [
        getResultMock.success(searchObj, options),
        getResultMock.success(visualizationObj, options),
      ],
    });
  };

  describe('handles accumulated errors as expected', () => {
    const resolvableErrors: SavedObjectsImportError[] = [
      { type: 'foo', id: 'foo-id', error: { type: 'conflict' } } as SavedObjectsImportError,
      {
        type: 'bar',
        id: 'bar-id',
        error: { type: 'ambiguous_conflict' },
      } as SavedObjectsImportError,
      {
        type: 'baz',
        id: 'baz-id',
        error: { type: 'missing_references' },
      } as SavedObjectsImportError,
      {
        type: 'baz',
        id: 'baz-id',
        error: { type: 'missing_data_source' },
      } as SavedObjectsImportError,
    ];
    const unresolvableErrors: SavedObjectsImportError[] = [
      { type: 'qux', id: 'qux-id', error: { type: 'unsupported_type' } } as SavedObjectsImportError,
      { type: 'quux', id: 'quux-id', error: { type: 'unknown' } } as SavedObjectsImportError,
    ];

    test('does not call bulkCreate when resolvable errors are present', async () => {
      for (const error of resolvableErrors) {
        const options = setupParams({ objects: objs, accumulatedErrors: [error] });
        await createSavedObjects(options);
        expect(bulkCreate).not.toHaveBeenCalled();
      }
    });

    test('does not call bulkCreate when resolvable errors are present with data source objects', async () => {
      for (const error of resolvableErrors) {
        const options = setupParams({ objects: dataSourceObjs, accumulatedErrors: [error] });
        await createSavedObjects(options);
        expect(bulkCreate).not.toHaveBeenCalled();
      }
    });

    test('calls bulkCreate when unresolvable errors or no errors are present', async () => {
      for (const error of unresolvableErrors) {
        const options = setupParams({ objects: objs, accumulatedErrors: [error] });
        setupMockResults(options);
        await createSavedObjects(options);
        expect(bulkCreate).toHaveBeenCalledTimes(1);
        bulkCreate.mockClear();
      }
      const options = setupParams({ objects: objs });
      setupMockResults(options);
      await createSavedObjects(options);
      expect(bulkCreate).toHaveBeenCalledTimes(1);
    });

    test('calls bulkCreate when unresolvable errors or no errors are present with data source', async () => {
      for (const error of unresolvableErrors) {
        const options = setupParams({ objects: dataSourceObjs, accumulatedErrors: [error] });
        setupMockResultsWithDataSource(options);
        await createSavedObjects(options);
        expect(bulkCreate).toHaveBeenCalledTimes(1);
        bulkCreate.mockClear();
      }
      const options = setupParams({ objects: dataSourceObjs });
      setupMockResultsWithDataSource(options);
      await createSavedObjects(options);
      expect(bulkCreate).toHaveBeenCalledTimes(1);
    });
  });

  it('filters out version from objects before create', async () => {
    const options = setupParams({ objects: [{ ...obj1, version: 'foo' }] });
    bulkCreate.mockResolvedValue({ saved_objects: [getResultMock.success(obj1, options)] });

    await createSavedObjects(options);
    expectBulkCreateArgs.objects(1, [obj1]);
  });

  const testBulkCreateObjects = async (namespace?: string) => {
    const options = setupParams({ objects: objs, namespace });
    setupMockResults(options);

    await createSavedObjects(options);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    // these three objects are transformed before being created, because they are included in the `importIdMap`
    const x3 = { ...obj3, id: importId3, originId: undefined }; // this import object already has an originId, but the entry has omitOriginId=true
    const x4 = { ...obj4, id: importId4 }; // this import object already has an originId
    const x8 = { ...obj8, id: importId8, originId: obj8.id }; // this import object doesn't have an originId, so it is set before create
    const argObjs = [obj1, obj2, x3, x4, obj5, obj6, obj7, x8, obj9, obj10, obj11, obj12, obj13];
    expectBulkCreateArgs.objects(1, argObjs);
  };

  const testBulkCreateObjectsWithDataSource = async (
    namespace?: string,
    dataSourceId?: string,
    dataSourceTitle?: string
  ) => {
    const options = setupParams({
      objects: dataSourceObjs,
      namespace,
      dataSourceId,
      dataSourceTitle,
    });
    setupMockResultsWithDataSource(options);

    await createSavedObjects(options);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    const argObjs = [
      dataSourceObj1,
      dataSourceObj2,
      dashboardObjWithDataSource,
      visualizationObjWithDataSource,
      searchObjWithDataSource,
    ];
    expectBulkCreateArgs.objects(1, argObjs);
  };

  // testBulkCreateObjectsToAddDataSourceTitle
  const testBulkCreateObjectsToAddDataSourceTitle = async (
    namespace?: string,
    dataSourceId?: string,
    dataSourceTitle?: string
  ) => {
    const options = setupParams({
      objects: [searchObj, visualizationObj],
      namespace,
      dataSourceId,
      dataSourceTitle,
    });
    setupMockResultsToConstructDataSource(options);
    const result = (await createSavedObjects(options)).createdObjects;
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    result.map((resultObj) =>
      expect(JSON.stringify(resultObj.attributes)).toContain('some-data-source-title')
    );
  };

  const testBulkCreateOptions = async (namespace?: string) => {
    const overwrite = (Symbol() as unknown) as boolean;
    const options = setupParams({ objects: objs, namespace, overwrite });
    setupMockResults(options);

    await createSavedObjects(options);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expectBulkCreateArgs.options(1, options);
  };

  const testBulkCreateOptionsWithDataSource = async (
    namespace?: string,
    dataSourceId?: string,
    dataSourceTitle?: string
  ) => {
    const overwrite = (Symbol() as unknown) as boolean;
    const options = setupParams({
      objects: dataSourceObjs,
      namespace,
      overwrite,
      dataSourceId,
      dataSourceTitle,
    });
    setupMockResultsWithDataSource(options);

    await createSavedObjects(options);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expectBulkCreateArgs.options(1, options);
  };
  const testReturnValue = async (namespace?: string) => {
    const options = setupParams({ objects: objs, namespace });
    setupMockResults(options);

    const results = await createSavedObjects(options);
    const resultSavedObjects = (await bulkCreate.mock.results[0].value).saved_objects;
    const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13] = resultSavedObjects;
    // these three results are transformed before being returned, because the bulkCreate attempt used different IDs for them
    const [x3, x4, x8] = [r3, r4, r8].map((x: SavedObject) => ({ ...x, destinationId: x.id }));
    const transformedResults = [r1, r2, x3, x4, r5, r6, r7, x8, r9, r10, r11, r12, r13];
    const expectedResults = getExpectedResults(transformedResults, objs);
    expect(results).toEqual(expectedResults);
  };

  const testTSVBVisualizationsWithDataSources = async (params: {
    objects: SavedObject[];
    expectedFilteredObjects: SavedObject[];
    dataSourceId?: string;
    dataSourceTitle?: string;
  }) => {
    const savedObjectsCustomClient = savedObjectsClientMock.create();

    const options = setupParams({
      ...params,
      savedObjectsCustomClient,
    });

    savedObjectsCustomClient.bulkCreate = jest.fn().mockImplementation((objectsToCreate, _) => {
      return Promise.resolve({
        saved_objects: objectsToCreate,
      });
    });

    const results = await createSavedObjects(options);

    expect(results.createdObjects).toMatchObject(params.expectedFilteredObjects);
  };

  const testReturnValueWithDataSource = async (
    namespace?: string,
    dataSourceId?: string,
    dataSourceTitle?: string
  ) => {
    const options = setupParams({
      objects: dataSourceObjs,
      namespace,
      dataSourceId,
      dataSourceTitle,
    });
    setupMockResultsWithDataSource(options);

    const results = await createSavedObjects(options);
    const resultSavedObjectsWithDataSource = (await bulkCreate.mock.results[0].value).saved_objects;
    const [dsr1, dsr2, dsr3, dsr4, dsr5] = resultSavedObjectsWithDataSource;
    const transformedResultsWithDataSource = [dsr1, dsr2, dsr3, dsr4, dsr5];
    const expectedResultsWithDataSource = getExpectedResults(
      transformedResultsWithDataSource,
      dataSourceObjs
    );
    expect(results).toEqual(expectedResultsWithDataSource);
  };

  const testVegaTimelineVisualizationsWithDataSources = async (params: {
    objects: SavedObject[];
    expectedFilteredObjects: Array<Record<string, unknown>>;
    dataSourceId?: string;
    dataSourceTitle?: string;
  }) => {
    const savedObjectsCustomClient = savedObjectsClientMock.create();

    const options = setupParams({
      ...params,
      savedObjectsCustomClient,
    });
    savedObjectsCustomClient.bulkCreate = jest.fn().mockResolvedValue({
      saved_objects: params.objects.map((obj) => {
        return getResultMock.success(obj, options);
      }),
    });

    const results = await createSavedObjects(options);

    expect(results.createdObjects).toMatchObject(params.expectedFilteredObjects);
  };

  describe('with an undefined namespace', () => {
    test('calls bulkCreate once with input objects', async () => {
      await testBulkCreateObjects();
    });
    test('calls bulkCreate once with input options', async () => {
      await testBulkCreateOptions();
    });
    test('returns bulkCreate results that are remapped to IDs of imported objects', async () => {
      await testReturnValue();
    });
  });

  describe('with a defined namespace', () => {
    const namespace = 'some-namespace';
    test('calls bulkCreate once with input objects', async () => {
      await testBulkCreateObjects(namespace);
    });
    test('calls bulkCreate once with input options', async () => {
      await testBulkCreateOptions(namespace);
    });
    test('returns bulkCreate results that are remapped to IDs of imported objects', async () => {
      await testReturnValue(namespace);
    });
  });

  describe('with a data source', () => {
    test('calls bulkCreate once with input objects with data source id', async () => {
      await testBulkCreateObjectsWithDataSource(
        'some-namespace',
        'some-datasource-id',
        'some-data-source-title'
      );
    });
    test('calls bulkCreate once with input options with data source id', async () => {
      await testBulkCreateOptionsWithDataSource(
        'some-namespace',
        'some-datasource-id',
        'some-data-source-title'
      );
    });
    test('returns bulkCreate results that are remapped to IDs of imported objects with data source id', async () => {
      await testReturnValueWithDataSource(
        'some-namespace',
        'some-datasource-id',
        'some-data-source-title'
      );
    });

    test('can correct attach datasource id to a search object', async () => {
      await testBulkCreateObjectsToAddDataSourceTitle(
        'some-namespace',
        'some-datasource-id',
        'some-data-source-title'
      );
    });
  });

  describe('with a data source for Vega saved objects', () => {
    test('can attach a data source name to the Vega spec if there is a local query', async () => {
      const objects = [getVegaVisualizationObj('some-vega-id')];
      const expectedObject = getVegaVisualizationObj('some-vega-id');
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-title_dataSourceName',
            visState:
              '{"title":"some-title","type":"vega","aggs":[],"params":{"spec":"{\\n  data: {\\n    url: {\\n      index: example_index\\n      data_source_name: dataSourceName\\n    }\\n  }\\n}"}}',
          },
          id: 'some-vega-id',
          references: [
            {
              id: 'some-datasource-id',
              type: 'data-source',
              name: 'dataSource',
            },
          ],
        },
      ];
      await testVegaTimelineVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });

    test('will not update the data source name in the Vega spec if no local cluster queries', async () => {
      const objects = [getVegaMDSVisualizationObj('some-vega-id', 'old-datasource-id')];
      const expectedObject = getVegaMDSVisualizationObj('some-vega-id', 'old-datasource-id');
      expectedObject.references.push({
        id: 'some-datasource-id',
        name: 'dataSource',
        type: 'data-source',
      });
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-other-title_dataSourceName',
            visState:
              '{"title":"some-other-title","type":"vega","aggs":[],"params":{"spec":"{\\n  data: {\\n    url: {\\n      index: example_index\\n      data_source_name: old-datasource-title\\n    }\\n  }\\n}"}}',
          },
        },
      ];
      await testVegaTimelineVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });
  });

  describe('with a data source for timeline saved objects', () => {
    test('can attach a data source name to the timeline expression', async () => {
      const objects = [getTimelineVisualizationObj('some-timeline-id', 'some-datasource-id')];
      const expectedObject = getTimelineVisualizationObj('some-timeline-id', 'some-datasource-id');
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-other-title_dataSourceName',
            visState:
              '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp, data_source_name=\\"dataSourceName\\")"},"aggs":[]}',
          },
        },
      ];
      await testVegaTimelineVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });

    test('will not update the data source name in the timeline expression if no local cluster queries', async () => {
      const objects = [
        getTimelineVisualizationObjWithDataSourceName('some-timeline-id', 'old-datasource-id'),
      ];
      const expectedObject = getTimelineVisualizationObjWithDataSourceName(
        'some-timeline-id',
        'old-datasource-id'
      );
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-other-title_dataSourceName',
            visState:
              '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp, data_source_name=ds1)"},"aggs":[]}',
          },
        },
      ];
      await testVegaTimelineVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });

    test('When muliple opensearch query exists in expression, we can add data source name to the queries that missing data source name.', async () => {
      const objects = [
        getTimelineVisualizationObjWithMultipleQueries('some-timeline-id', 'some-datasource-id'),
      ];
      const expectedObject = getTimelineVisualizationObjWithMultipleQueries(
        'some-timeline-id',
        'some-datasource-id'
      );
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-other-title_dataSourceName',
            visState:
              '{"title":"some-other-title","type":"timelion","params":{"expression":".es(index=old-datasource-title, timefield=@timestamp, data_source_name=\\"aos 211\\"), .elasticsearch(index=old-datasource-title, timefield=@timestamp, data_source_name=\\"dataSourceName\\")"},"aggs":[]}',
          },
        },
      ];
      await testVegaTimelineVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });
  });

  describe('with a data source for TSVB saved objects', () => {
    test('can attach a TSVB datasource reference to a non-MDS ', async () => {
      const objects = [getTSVBVisualizationObj('some-tsvb-id')];
      const expectedObject = getTSVBVisualizationObj('some-tsvb-id', 'some-datasource-id');
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-title_dataSourceName',
          },
        },
      ];
      await testTSVBVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });

    test('can update a TSVB datasource reference', async () => {
      const objects = [getTSVBVisualizationObj('some-tsvb-id', 'old-datasource-id')];
      const expectedObject = getTSVBVisualizationObj('some-tsvb-id', 'some-datasource-id');
      const expectedFilteredObjects = [
        {
          ...expectedObject,
          attributes: {
            title: 'some-title_dataSourceName',
          },
        },
      ];
      await testTSVBVisualizationsWithDataSources({
        objects,
        expectedFilteredObjects,
        dataSourceId: 'some-datasource-id',
        dataSourceTitle: 'dataSourceName',
      });
    });
  });

  describe('with a undefined workspaces', () => {
    test('calls bulkCreate once with input objects', async () => {
      const options = setupParams({ objects: objs });
      setupMockResults(options);

      await createSavedObjects(options);
      expect(bulkCreate.mock.calls[0][1]?.hasOwnProperty('workspaces')).toEqual(false);
    });
  });
});
