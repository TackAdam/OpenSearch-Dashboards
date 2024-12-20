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

import Joi from 'joi';

const dataIndexSchema = Joi.object({
  id: Joi.string()
    .regex(/^[a-zA-Z0-9-]+$/)
    .required(),

  // path to newline delimented JSON file containing data relative to OPENSEARCH_DASHBOARDS_HOME
  dataPath: Joi.string().required(),

  // Object defining OpenSearch field mappings (contents of index.mappings.type.properties)
  fields: Joi.object().required(),

  // times fields that will be updated relative to now when data is installed
  timeFields: Joi.array().items(Joi.string()).required(),

  // Reference to now in your test data set.
  // When data is installed, timestamps are converted to the present time.
  // The distance between a timestamp and currentTimeMarker is preserved but the date and time will change.
  // For example:
  //   sample data set:    timestamp: 2018-01-01T00:00:00Z, currentTimeMarker: 2018-01-01T12:00:00Z
  //   installed data set: timestamp: 2018-04-18T20:33:14Z, currentTimeMarker: 2018-04-19T08:33:14Z
  currentTimeMarker: Joi.string().isoDate().required(),

  // Set to true to move timestamp to current week, preserving day of week and time of day
  // Relative distance from timestamp to currentTimeMarker will not remain the same
  preserveDayOfWeekTimeOfDay: Joi.boolean().default(false),

  // Optional indexName field, if added wouldn't all flow would use this name
  // `createIndexName` wouldn't be used
  indexName: Joi.string(),
});

const appLinkSchema = Joi.object({
  path: Joi.string().required(),
  label: Joi.string().required(),
  icon: Joi.string().required(),
  // Alternative app path when new nav flag is enabled
  newPath: Joi.string(),
  appendDatasourceToPath: Joi.string(),
});

export const sampleDataSchema = {
  id: Joi.string()
    .regex(/^[a-zA-Z0-9-]+$/)
    .required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  previewImagePath: Joi.string().required(),
  darkPreviewImagePath: Joi.string(),
  hasNewThemeImages: Joi.boolean(),

  // saved object id of main dashboard for sample data set
  overviewDashboard: Joi.string().required(),
  getDataSourceIntegratedDashboard: Joi.func().required(),
  appLinks: Joi.array().items(appLinkSchema).default([]),

  // saved object id of default index-pattern for sample data set
  defaultIndex: Joi.string().required(),
  getDataSourceIntegratedDefaultIndex: Joi.func().required(),

  // OpenSearch Dashboards saved objects (index patter, visualizations, dashboard, ...)
  // Should provide a nice demo of OpenSearch Dashboards's functionality with the sample data set
  savedObjects: Joi.array().items(Joi.object()).required(),
  getDataSourceIntegratedSavedObjects: Joi.func().required(),
  dataIndices: Joi.array().items(dataIndexSchema).required(),

  status: Joi.string(),
  statusMsg: Joi.any(),
};
