/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './trace_details_view.scss';
import React, { useMemo, useState } from 'react';
import { 
  EuiEmptyPrompt, 
  EuiText, 
  EuiSpacer, 
  EuiButton, 
  EuiFlyout, 
  EuiFlyoutHeader, 
  EuiFlyoutBody, 
  EuiFlyoutFooter,
  EuiTitle,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TraceDetails } from '../../../application/pages/traces/trace_details/trace_view';
import { DocViewRenderProps } from '../../../types/doc_views_types';
import { ExploreFlavor } from '../../../../common';

/**
 * Extract trace ID from a span/trace record
 */
const extractTraceIdFromHit = (hit: any): string | null => {
  // Try different possible field paths for trace ID
  const possiblePaths = [
    'traceId',
    'trace_id',
    'traceID',
    '_source.traceId',
    '_source.trace_id',
    '_source.traceID',
    'fields.traceId',
    'fields.trace_id',
    'fields.traceID'
  ];

  for (const path of possiblePaths) {
    const value = getNestedValue(hit, path);
    if (value && typeof value === 'string') {
      return value;
    }
  }

  return null;
};

/**
 * Extract span ID from a span/trace record
 */
const extractSpanIdFromHit = (hit: any): string | null => {
  // Try different possible field paths for span ID
  const possiblePaths = [
    'spanId',
    'span_id',
    'spanID',
    '_source.spanId',
    '_source.span_id',
    '_source.spanID',
    'fields.spanId',
    'fields.span_id',
    'fields.spanID'
  ];

  for (const path of possiblePaths) {
    const value = getNestedValue(hit, path);
    if (value && typeof value === 'string') {
      return value;
    }
  }

  return null;
};

/**
 * Get nested value from object using dot notation
 */
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
};

/**
 * Extract data source ID from URL state or index pattern
 */
const extractDataSourceId = (indexPattern: any, hit: any): string => {
  // First try to get from URL hash (explore state)
  try {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const qParam = urlParams.get('_q');
    if (qParam) {
      const decodedQ = decodeURIComponent(qParam);
      const dataSourceMatch = decodedQ.match(/dataSource:\(id:'([^']+)'/);
      if (dataSourceMatch) {
        return dataSourceMatch[1];
      }
    }
  } catch (error) {
    console.warn('Failed to extract data source from URL:', error);
  }
  
  // Fallback to index pattern or hit
  return indexPattern?.dataSourceId || hit?._source?.dataSourceId || '';
};

/**
 * Extract index pattern from URL state or use fallback
 */
const extractIndexPattern = (indexPattern: any): string => {
  // First try to get the query source pattern from URL hash
  try {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const qParam = urlParams.get('_q');
    if (qParam) {
      const decodedQ = decodeURIComponent(qParam);
      
      // Look for the query pattern - it's URL encoded
      const queryMatch = decodedQ.match(/query:'([^']+)'/);
      if (queryMatch) {
        const encodedQuery = queryMatch[1];
        
        // Decode the query and extract the source pattern
        const decodedQuery = decodeURIComponent(encodedQuery);
        
        // Extract the source pattern from "source = otel-v1-apm-span-*"
        const sourceMatch = decodedQuery.match(/source\s*=\s*(.+)/);
        if (sourceMatch) {
          const sourcePattern = sourceMatch[1].trim();
          return sourcePattern;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to extract index pattern from URL:', error);
  }
  
  // Fallback to default pattern instead of specific index
  return 'otel-v1-apm-span-*';
};

/**
 * Check if we're currently on the traces flavor by examining the URL
 */
const isOnTracesFlavor = (): boolean => {
  const currentPath = window.location.pathname;
  const currentHash = window.location.hash;
  
  // Check if the URL contains the traces flavor
  return currentPath.includes('/explore/traces') || currentHash.includes('/explore/traces');
};

/**
 * Trace Details view component for the doc viewer accordion
 */
export function TraceDetailsView({ hit, indexPattern }: DocViewRenderProps) {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [currentSelectedSpanId, setCurrentSelectedSpanId] = useState<string | undefined>();

  // Only show trace details view when on traces flavor
  if (!isOnTracesFlavor()) {
    return null;
  }

  // Extract trace information from the hit
  const traceInfo = useMemo(() => {
    const traceId = extractTraceIdFromHit(hit);
    
    if (!traceId) {
      return null;
    }

    const spanId = extractSpanIdFromHit(hit);
    const dataSourceId = extractDataSourceId(indexPattern, hit);
    const indexPatternTitle = extractIndexPattern(indexPattern);

    return {
      traceId,
      spanId,
      dataSourceId,
      indexPattern: indexPatternTitle,
    };
  }, [hit, indexPattern]);

  // Handle state changes from the embedded TraceDetails component
  const handleStateChange = (state: any) => {
    if (state.spanId !== currentSelectedSpanId) {
      setCurrentSelectedSpanId(state.spanId);
    }
  };

  // Show empty state if no trace data is available
  if (!traceInfo) {
    return (
      <div className="exploreTraceDetailsView__empty">
        <EuiEmptyPrompt
          iconType="search"
          title={
            <h4>
              {i18n.translate('explore.docViews.traceDetails.noTrace.title', {
                defaultMessage: 'No trace data found',
              })}
            </h4>
          }
          body={
            <>
              <EuiText size="s">
                {i18n.translate('explore.docViews.traceDetails.noTrace.description', {
                  defaultMessage: 'No trace ID found in this document. Make sure this document contains trace data with a valid trace ID field.',
                })}
              </EuiText>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                {i18n.translate('explore.docViews.traceDetails.noTrace.hint', {
                  defaultMessage: 'Trace ID fields searched: traceId, trace_id, traceID',
                })}
              </EuiText>
            </>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="exploreTraceDetailsView">
        <EuiText size="s" color="subdued">
          {i18n.translate('explore.docViews.traceDetails.description', {
            defaultMessage: 'View detailed trace analysis including timeline, service map, and span details for trace ID: {traceId}',
            values: { traceId: traceInfo.traceId },
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiButton
          onClick={() => setIsFlyoutOpen(true)}
          iconType="inspect"
          size="s"
          data-test-subj="openTraceDetailsFlyout"
        >
          {i18n.translate('explore.docViews.traceDetails.openButton', {
            defaultMessage: 'Open Trace Details',
          })}
        </EuiButton>
      </div>

      {isFlyoutOpen && (
        <EuiFlyout
          onClose={() => setIsFlyoutOpen(false)}
          size="l"
          paddingSize="none"
          data-test-subj="traceDetailsFlyout"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem>
                <EuiTitle size="m">
                  <h2>
                    {i18n.translate('explore.docViews.traceDetails.flyout.title', {
                      defaultMessage: 'Trace: {traceId}',
                      values: { traceId: traceInfo.traceId },
                    })}
                  </h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false} style={{ marginRight: '48px' }}>
                <EuiButton
                  onClick={() => {
                    // Extract the base URL parts from current location
                    const origin = window.location.origin;
                    const pathname = window.location.pathname;
                    
                    // Get the base path before /app (this already includes workspace if present)
                    const basePathMatch = pathname.match(/^(.*?)\/app/);
                    const basePath = basePathMatch ? basePathMatch[1] : '';
                    
                    // Use the currently selected span if available, otherwise fall back to original span
                    const spanIdToUse = currentSelectedSpanId || traceInfo.spanId || '';
                    
                    // Construct the full page URL
                    const fullPageUrl = `${origin}${basePath}/app/explore/traces/traceDetails#/?_a=(dataSourceId:'${traceInfo.dataSourceId}',indexPattern:'${traceInfo.indexPattern}',spanId:'${spanIdToUse}',traceId:'${traceInfo.traceId}')&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))`;
                    
                    window.open(fullPageUrl, '_blank');
                  }}
                  iconType="popout"
                  size="s"
                  data-test-subj="openFullPageButton"
                >
                  {i18n.translate('explore.docViews.traceDetails.flyout.openFullPage', {
                    defaultMessage: 'Open full page',
                  })}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>
          
          <EuiFlyoutBody>
            <TraceDetails
              isEmbedded={true}
              traceId={traceInfo.traceId}
              dataSourceId={traceInfo.dataSourceId}
              indexPattern={traceInfo.indexPattern}
              initialSpanId={traceInfo.spanId || undefined}
              onStateChange={handleStateChange}
            />
          </EuiFlyoutBody>
          
          <EuiFlyoutFooter>
            <EuiButtonEmpty
              onClick={() => setIsFlyoutOpen(false)}
              data-test-subj="closeTraceDetailsFlyout"
            >
              {i18n.translate('explore.docViews.traceDetails.flyout.closeButton', {
                defaultMessage: 'Close',
              })}
            </EuiButtonEmpty>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </>
  );
}
