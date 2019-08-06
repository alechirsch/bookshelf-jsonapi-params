'use strict';

var _lodash = require('lodash');

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// Output postgres compliant query stub that accesses a property of a jsonb column
var pgAttributeChain = function pgAttributeChain(column, jsonColumn, dataType) {
    var _ref = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {},
        _ref$includeAs = _ref.includeAs,
        includeAs = _ref$includeAs === undefined ? false : _ref$includeAs;

    var propertyChain = jsonColumn.split('.');
    var bindings = [column].concat(_toConsumableArray(propertyChain));
    var sanitizedDataType = null;
    if (dataType === 'numeric') {
        sanitizedDataType = 'numeric';
    } else if (dataType === 'date') {
        sanitizedDataType = 'date';
    } else if (dataType === 'timestamp') {
        sanitizedDataType = 'timestamp';
    }
    var jsonSQL = '??#>>\'{' + propertyChain.map(function () {
        return '??';
    }).join(',') + '}\'';
    if (sanitizedDataType) {
        jsonSQL = '(' + jsonSQL + ')::' + sanitizedDataType;
    }
    if (includeAs) {
        jsonSQL = jsonSQL + ' as ??';
        // for JSONB, the leaf attribute of the object access is the column name
        bindings.push(propertyChain[propertyChain.length - 1]);
    }

    return { jsonSQL: jsonSQL, bindings: bindings };
};

var equalityJsonFilter = function equalityJsonFilter(jsonSQL, values, hasNull, qb, bindings, knex) {
    var whereType = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 'where';


    var rawQueryStringWithBindings = jsonSQL + ' in (' + values.map(function () {
        return '?';
    }).join(',') + ')';
    if (hasNull) {
        qb[whereType](function (qbWhere) {
            // Clone the bindings array to avoid sharing the same array with the orWhere below
            qbWhere.whereRaw(jsonSQL + ' is null', [].concat(_toConsumableArray(bindings)));
            if (!(0, _lodash.isEmpty)(values)) {
                qbWhere.orWhere(knex.raw(rawQueryStringWithBindings, [].concat(_toConsumableArray(bindings), _toConsumableArray(values))));
            }
        });
    } else {
        qb[whereType + 'Raw'](rawQueryStringWithBindings, [].concat(_toConsumableArray(bindings), _toConsumableArray(values)));
    }
};

module.exports.buildFilterWithType = function (qb, knex, filterType, values, column, jsonColumn, dataType, extraEqualityFilterValues) {
    var _pgAttributeChain = pgAttributeChain(column, jsonColumn, dataType),
        jsonSQL = _pgAttributeChain.jsonSQL,
        bindings = _pgAttributeChain.bindings;

    // Remove all null and 'null' from the values array. If the length is different after removal, there were nulls


    var hasNull = values.length !== (0, _lodash.pull)(values, null, 'null').length;

    if (filterType === 'equal') {
        equalityJsonFilter(jsonSQL, values, hasNull, qb, bindings, knex);
    } else if (filterType === 'like') {
        qb.where(function (qbWhere) {

            var where = 'where';
            (0, _lodash.forEach)(values, function (value) {

                var subBindings = [].concat(_toConsumableArray(bindings), ['%' + value + '%']);
                qbWhere[where](knex.raw('LOWER((' + jsonSQL + ')::text) like LOWER(?)', subBindings));

                // Change to orWhere after the first where
                if (where === 'where') {
                    where = 'orWhere';
                }
            });

            /// Handle if key is also in equality filter
            if (extraEqualityFilterValues) {
                var extraHasNull = extraEqualityFilterValues.length !== (0, _lodash.pull)(extraEqualityFilterValues, null, 'null').length;
                equalityJsonFilter(jsonSQL, extraEqualityFilterValues, extraHasNull, qbWhere, bindings, knex, 'orWhere');
            }
        });
    } else if (filterType === 'not') {
        if (hasNull) {
            qb.whereRaw(jsonSQL + ' is not null', bindings);
        }
        if (!(0, _lodash.isEmpty)(values)) {
            bindings.push.apply(bindings, _toConsumableArray(values));
            qb.whereRaw(jsonSQL + ' not in (' + values.map(function () {
                return '?';
            }).join(',') + ')', bindings);
        }
    }
    // All other filter types, the values is expected to NOT be an array. This follows the logic in the main index file.
    else if (filterType === 'gt') {
            bindings.push.apply(bindings, _toConsumableArray(values));
            qb.whereRaw(jsonSQL + ' > ?', bindings);
        } else if (filterType === 'gte') {
            bindings.push.apply(bindings, _toConsumableArray(values));
            qb.whereRaw(jsonSQL + ' >= ?', bindings);
        } else if (filterType === 'lt') {
            bindings.push.apply(bindings, _toConsumableArray(values));
            qb.whereRaw(jsonSQL + ' < ?', bindings);
        } else if (filterType === 'lte') {
            bindings.push.apply(bindings, _toConsumableArray(values));
            qb.whereRaw(jsonSQL + ' <= ?', bindings);
        }
};

module.exports.buildSelect = function (qb, knex, column, jsonColumn, dataType) {
    // TODO: aggregate functions count, sum, avg, max, min
    var _pgAttributeChain2 = pgAttributeChain(column, jsonColumn, dataType, { includeAs: true }),
        jsonSQL = _pgAttributeChain2.jsonSQL,
        bindings = _pgAttributeChain2.bindings;

    qb.select(knex.raw(jsonSQL, bindings));
};

module.exports.buildSort = function (qb, sortType, column, jsonColumn, dataType) {

    // Ensure that the sort direction can not be injected
    var sanitizedSortType = 'asc';
    if (sortType === 'desc') {
        sanitizedSortType = 'desc';
    }

    var _pgAttributeChain3 = pgAttributeChain(column, jsonColumn, dataType),
        jsonSQL = _pgAttributeChain3.jsonSQL,
        bindings = _pgAttributeChain3.bindings;

    qb.orderByRaw(jsonSQL + ' ' + sanitizedSortType, bindings);
};