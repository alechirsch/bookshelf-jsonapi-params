'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _lodash = require('lodash');

var _splitString = require('split-string');

var _splitString2 = _interopRequireDefault(_splitString);

var _inflection = require('inflection');

var _inflection2 = _interopRequireDefault(_inflection);

var _bookshelfPage = require('bookshelf-page');

var _bookshelfPage2 = _interopRequireDefault(_bookshelfPage);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; } // Load modules

/**
 * Exports a plugin to pass into the bookshelf instance, i.e.:
 *
 *      import config from './knexfile';
 *      import knex from 'knex';
 *      import bookshelf from 'bookshelf';
 *
 *      const Bookshelf = bookshelf(knex(config));
 *
 *      Bookshelf.plugin('bookshelf-jsonapi-params');
 *
 *      export default Bookshelf;
 *
 * The plugin attaches the `fetchJsonApi` instance method to
 * the Bookshelf Model object.
 *
 * See methods below for details.
 */
exports.default = function (Bookshelf) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};


    // Load the pagination plugin
    Bookshelf.plugin(_bookshelfPage2.default);

    /**
     * Similar to {@link Model#fetch} and {@link Model#fetchAll}, but specifically
     * uses parameters defined by the {@link https://jsonapi.org|JSON API spec} to
     * build a query to further refine a result set.
     *
     * @param  opts {object}
     *     Currently supports the `include`, `fields`, `sort`, `page` and `filter`
     *     parameters from the {@link https://jsonapi.org|JSON API spec}.
     * @param  type {string}
     *     An optional string that specifies the type of resource being retrieved.
     *     If not specified, type will default to the name of the table associated
     *     with the model.
     * @return {Promise<Model|Collection|null>}
     */
    var fetchJsonApi = function fetchJsonApi(opts) {
        var isCollection = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

        var _this = this;

        var type = arguments[2];
        var additionalQuery = arguments[3];


        opts = opts || {};

        var internals = {};
        var _opts = opts,
            include = _opts.include,
            fields = _opts.fields,
            sort = _opts.sort,
            _opts$page = _opts.page,
            page = _opts$page === undefined ? {} : _opts$page,
            filter = _opts.filter,
            group = _opts.group;

        var filterTypes = ['like', 'not', 'lt', 'gt', 'lte', 'gte'];

        // Get a reference to the field being used as the id
        internals.idAttribute = this.constructor.prototype.idAttribute ? this.constructor.prototype.idAttribute : 'id';

        // Get a reference to the current model name. Note that if no type is
        // explicitly passed, the tableName will be used
        internals.modelName = type ? type : this.constructor.prototype.tableName;

        // Initialize an instance of the current model and clone the initial query
        internals.model = this.constructor.forge().query(function (qb) {
            return (0, _lodash.assign)(qb, _this.query().clone());
        });

        /**
         * Build a query for relational dependencies of filtering, grouping and sorting
         * @param   filterValues {object}
         * @param   groupValues {object}
         * @param   sortValues {object}
         */
        internals.buildDependencies = function (filterValues, groupValues, sortValues) {

            var relationHash = {};
            // Find relations in filterValues
            if ((0, _lodash.isObjectLike)(filterValues) && !(0, _lodash.isEmpty)(filterValues)) {

                // Loop through each filter value
                (0, _lodash.forEach)(filterValues, function (value, key) {

                    // If the filter is not an equality filter
                    if ((0, _lodash.isObjectLike)(value)) {
                        if (!(0, _lodash.isEmpty)(value)) {
                            (0, _lodash.forEach)(value, function (typeValue, typeKey) {

                                // Add relations to the relationHash
                                internals.buildDependenciesHelper(typeKey, relationHash);
                            });
                        }
                    }
                    // If the filter is an equality filter
                    else {
                            internals.buildDependenciesHelper(key, relationHash);
                        }
                });
            }

            // Find relations in sortValues
            if ((0, _lodash.isObjectLike)(sortValues) && !(0, _lodash.isEmpty)(sortValues)) {

                // Loop through each sort value
                (0, _lodash.forEach)(sortValues, function (value) {

                    // If the sort value is descending, remove the dash
                    if (value.indexOf('-') === 0) {
                        value = value.substr(1);
                    }
                    // Add relations to the relationHash
                    internals.buildDependenciesHelper(value, relationHash);
                });
            }

            // Find relations in groupValues
            if ((0, _lodash.isObjectLike)(groupValues) && !(0, _lodash.isEmpty)(groupValues)) {

                // Loop through each group value
                (0, _lodash.forEach)(groupValues, function (value) {

                    // Add relations to the relationHash
                    internals.buildDependenciesHelper(value, relationHash);
                });
            }

            // Need to select model.* so all of the relations are not returned, also check if there is anything in fields object
            if ((0, _lodash.keys)(relationHash).length && !(0, _lodash.keys)(fields).length) {
                internals.model.query(function (qb) {
                    qb.select(internals.modelName + '.*');
                });
            }
            // Recurse on each of the relations in relationHash
            (0, _lodash.forIn)(relationHash, function (value, key) {

                return internals.queryRelations(value, key, _this, internals.modelName);
            });
        };

        /**
         * Recursive funtion to add relationships to main query to allow filtering and sorting
         * on relationships by using left outer joins
         * @param   relation {object}
         * @param   relationKey {string}
         * @param   parent {object}
         * @param   parentKey {string}
         */
        internals.queryRelations = function (relation, relationKey, parentModel, parentKey) {

            // Add left outer joins for the relation
            var relatedData = parentModel[relationKey]().relatedData;

            internals.model.query(function (qb) {

                var foreignKey = relatedData.foreignKey ? relatedData.foreignKey : _inflection2.default.singularize(relatedData.parentTableName) + '_' + relatedData.parentIdAttribute;
                if (relatedData.type === 'hasOne' || relatedData.type === 'hasMany') {
                    qb.leftOuterJoin(relatedData.targetTableName + ' as ' + relationKey, parentKey + '.' + relatedData.parentIdAttribute, relationKey + '.' + foreignKey);
                } else if (relatedData.type === 'belongsTo') {
                    qb.leftOuterJoin(relatedData.targetTableName + ' as ' + relationKey, parentKey + '.' + foreignKey, relationKey + '.' + relatedData.targetIdAttribute);
                } else if (relatedData.type === 'belongsToMany') {
                    var otherKey = relatedData.otherKey ? relatedData.otherKey : _inflection2.default.singularize(relatedData.targetTableName) + '_id';
                    var joinTableName = relatedData.joinTableName ? relatedData.joinTableName : relatedData.throughTableName;

                    qb.leftOuterJoin(joinTableName + ' as ' + relationKey + '_' + joinTableName, parentKey + '.' + relatedData.parentIdAttribute, relationKey + '_' + joinTableName + '.' + foreignKey);
                    qb.leftOuterJoin(relatedData.targetTableName + ' as ' + relationKey, relationKey + '_' + joinTableName + '.' + otherKey, relationKey + '.' + relatedData.targetIdAttribute);
                } else if ((0, _lodash.includes)(relatedData.type, 'morph')) {
                    // Get the morph type and id
                    var morphType = relatedData.columnNames[0] ? relatedData.columnNames[0] : relatedData.morphName + '_type';
                    var morphId = relatedData.columnNames[1] ? relatedData.columnNames[0] : relatedData.morphName + '_id';
                    if (relatedData.type === 'morphOne' || relatedData.type === 'morphMany') {

                        qb.leftOuterJoin(relatedData.targetTableName + ' as ' + relationKey, function (qbJoin) {

                            qbJoin.on(relationKey + '.' + morphId, '=', parentKey + '.' + relatedData.parentIdAttribute);
                        }).where(relationKey + '.' + morphType, '=', relatedData.morphValue);
                    } else if (relatedData.type === 'morphTo') {
                        // Not implemented
                    }
                }
            });

            if (!(0, _lodash.keys)(relation).length) {
                return;
            }
            (0, _lodash.forIn)(relation, function (value, key) {

                return internals.queryRelations(value, key, parentModel[relationKey]().relatedData.target.forge(), relationKey);
            });
        };

        /**
         * Adds relations included in the key to the relationHash, used in buildDependencies
         * @param   key {string}
         * @param   relationHash {object}
         */
        internals.buildDependenciesHelper = function (key, relationHash) {

            if ((0, _lodash.includes)(key, '.')) {
                // The last item in the chain is a column name, not a table. Do not include column name in relationHash
                key = key.substring(0, key.lastIndexOf('.'));
                if (!(0, _lodash.has)(relationHash, key)) {
                    var level = relationHash;
                    var relations = key.split('.');
                    var relationModel = _this.clone();

                    // Traverse the relationHash object and set new relation if it does not exist
                    (0, _lodash.forEach)(relations, function (relation) {

                        // Check if valid relationship
                        if (typeof relationModel[relation] === 'function' && relationModel[relation]().relatedData.type) {
                            if (!level[relation]) {
                                level[relation] = {};
                            }
                            level = level[relation];

                            // Set relation model to the next item in the chain
                            relationModel = relationModel.related(relation).relatedData.target.forge();
                        } else {
                            return false;
                        }
                    });
                }
            }
        };

        /**
         * Build a query based on the `fields` parameter.
         * @param  fieldNames {object}
         */
        internals.buildFields = function () {
            var fieldNames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


            if ((0, _lodash.isObject)(fieldNames) && !(0, _lodash.isEmpty)(fieldNames)) {

                // Format column names
                fieldNames = internals.formatColumnNames(fieldNames);

                // Process fields for each type/relation
                (0, _lodash.forEach)(fieldNames, function (fieldValue, fieldKey) {

                    // Add qualifying table name to avoid ambiguous columns
                    fieldNames[fieldKey] = (0, _lodash.map)(fieldNames[fieldKey], function (value) {

                        // Extract any aggregate function around the column name
                        var column = value;
                        var aggregateFunction = null;
                        var regex = new RegExp(/(count|sum|avg|max|min)\((.+)\)/g);
                        var match = regex.exec(value);

                        if (match) {
                            aggregateFunction = match[1];
                            column = match[2];
                        }

                        if (!fieldKey) {
                            if (!(0, _lodash.includes)(column, '.')) {
                                column = internals.modelName + '.' + column;
                            }
                        } else {
                            column = fieldKey + '.' + column;
                        }

                        return aggregateFunction ? { aggregateFunction: aggregateFunction, column: column } : column;
                    });

                    // Only process the field if it's not a relation. Fields
                    // for relations are processed in `buildIncludes()`
                    if (!(0, _lodash.includes)(include, fieldKey)) {

                        // Add columns to query
                        internals.model.query(function (qb) {

                            if (!fieldKey) {
                                qb.distinct();
                            }

                            (0, _lodash.forEach)(fieldNames[fieldKey], function (column) {

                                if (column.aggregateFunction) {
                                    qb[column.aggregateFunction](column.column + ' as ' + column.aggregateFunction);
                                } else {
                                    qb.select([column]);
                                }
                            });

                            // JSON API considers relationships as fields, so we
                            // need to make sure the id of the relation is selected
                            (0, _lodash.forEach)(include, function (relation) {

                                if (internals.isBelongsToRelation(relation, _this)) {
                                    var relatedData = _this.related(relation).relatedData;
                                    var relationId = relatedData.foreignKey ? relatedData.foreignKey : _inflection2.default.singularize(relatedData.parentTableName) + '_' + relatedData.parentIdAttribute;
                                    qb.select(internals.modelName + '.' + relationId);
                                }
                            });
                        });
                    }
                });
            }
        };

        /**
         * Build a query based on the `filters` parameter.
         * @param  filterValues {object|array}
         */
        internals.buildFilters = function (filterValues) {

            if ((0, _lodash.isObjectLike)(filterValues) && !(0, _lodash.isEmpty)(filterValues)) {
                // format the column names of the filters
                //filterValues = this.format(filterValues);

                // build the filter query
                internals.model.query(function (qb) {

                    (0, _lodash.forEach)(filterValues, function (value, key) {

                        // If the value is a filter type
                        if ((0, _lodash.isObjectLike)(value)) {
                            // Format column names of filter types
                            var filterTypeValues = value;

                            // Check if filter type is valid
                            if ((0, _lodash.includes)(filterTypes, key)) {
                                // Loop through each value for the valid filter type
                                (0, _lodash.forEach)(filterTypeValues, function (typeValue, typeKey) {

                                    // Remove all but the last table name, need to get number of dots
                                    typeKey = internals.formatRelation(internals.formatColumnNames([typeKey])[0]);

                                    // Determine if there are multiple filters to be applied
                                    var valueArray = null;
                                    if (!(0, _lodash.isArray)(typeValue)) {
                                        valueArray = (0, _splitString2.default)(typeValue.toString(), ',');
                                    } else {
                                        valueArray = typeValue;
                                    }

                                    // Attach different query for each type
                                    if (key === 'like') {

                                        qb.where(function (qbWhere) {

                                            if ((0, _lodash.isArray)(valueArray)) {
                                                var where = 'where';
                                                (0, _lodash.forEach)(valueArray, function (val) {

                                                    qbWhere[where](Bookshelf.knex.raw('LOWER(CAST(:typeKey: AS text)) like LOWER(:value)', {
                                                        value: '%' + val + '%',
                                                        typeKey: typeKey
                                                    }));

                                                    // Change to orWhere after the first where
                                                    if (where === 'where') {
                                                        where = 'orWhere';
                                                    }
                                                });
                                            } else {
                                                qbWhere.where(Bookshelf.knex.raw('LOWER(CAST(:typeKey: AS text)) like LOWER(:value)', {
                                                    value: '%' + val + '%',
                                                    typeKey: typeKey
                                                }));
                                            }

                                            // If the key is in the top level filter, filter on orWhereIn
                                            if ((0, _lodash.hasIn)(filterValues, typeKey)) {
                                                // Determine if there are multiple filters to be applied
                                                value = filterValues[typeKey].toString().indexOf(',') !== -1 ? filterValues[typeKey].split(',') : filterValues[typeKey];
                                                qbWhere.orWhereIn(typeKey, value);
                                            }
                                        });
                                    } else if (key === 'not') {
                                        qb.whereNotIn(typeKey, valueArray);
                                    } else if (key === 'lt') {
                                        qb.where(typeKey, '<', typeValue);
                                    } else if (key === 'gt') {
                                        qb.where(typeKey, '>', typeValue);
                                    } else if (key === 'lte') {
                                        qb.where(typeKey, '<=', typeValue);
                                    } else if (key === 'gte') {
                                        qb.where(typeKey, '>=', typeValue);
                                    }
                                });
                            }
                        }
                        // If the value is an equality filter
                        else {
                                // If the key is in the like filter, ignore the filter
                                if (!(0, _lodash.hasIn)(filterValues.like, key)) {
                                    // Remove all but the last table name, need to get number of dots
                                    key = internals.formatRelation(internals.formatColumnNames([key])[0]);

                                    if ((0, _lodash.isNull)(value)) {
                                        qb.where(key, value);
                                    } else {
                                        // Determine if there are multiple filters to be applied
                                        if (!(0, _lodash.isArray)(value)) {
                                            value = (0, _splitString2.default)(value.toString(), ',');
                                        }
                                        qb.whereIn(key, value);
                                    }
                                }
                            }
                    });
                });
            }
        };

        /**
         * Takes in an attribute string like a.b.c.d and returns c.d, also if attribute
         * looks like 'a', it will return tableName.a where tableName is the top layer table name
         * @param   attribute {string}
         * @return  {string}
         */
        internals.formatRelation = function (attribute) {

            if ((0, _lodash.includes)(attribute, '.')) {
                var splitKey = attribute.split('.');
                attribute = splitKey[splitKey.length - 2] + '.' + splitKey[splitKey.length - 1];
            }
            // Add table name to before column name if no relation to avoid ambiguous columns
            else {
                    attribute = internals.modelName + '.' + attribute;
                }
            return attribute;
        };

        /**
         * Takes an array from attributes and returns the only the columns and removes the table names
         * @param   attributes {array}
         * @return  {array}
         */
        internals.getColumnNames = function (attributes) {

            return (0, _lodash.map)(attributes, function (attribute) {

                return attribute.substr(attribute.lastIndexOf('.') + 1);
            });
        };

        /**
         * Build a query based on the `include` parameter.
         * @param  includeValues {array}
         */
        internals.buildIncludes = function (includeValues) {

            if ((0, _lodash.isArray)(includeValues) && !(0, _lodash.isEmpty)(includeValues)) {

                var relations = [];

                (0, _lodash.forEach)(includeValues, function (relation) {

                    if ((0, _lodash.has)(fields, relation)) {

                        var fieldNames = internals.formatColumnNames(fields);

                        relations.push(_defineProperty({}, relation, function (qb) {

                            if (!internals.isBelongsToRelation(relation, _this)) {
                                var relatedData = _this[relation]().relatedData;
                                var foreignKey = relatedData.foreignKey ? relatedData.foreignKey : _inflection2.default.singularize(relatedData.parentTableName) + '_' + relatedData.parentIdAttribute;

                                if (!(0, _lodash.includes)(fieldNames[relation], foreignKey)) {
                                    qb.column.apply(qb, [foreignKey]);
                                }
                            }
                            fieldNames[relation] = internals.getColumnNames(fieldNames[relation]);
                            if (!(0, _lodash.includes)(fieldNames[relation], 'id')) {
                                qb.column.apply(qb, ['id']);
                            }
                            qb.column.apply(qb, [fieldNames[relation]]);
                        }));
                    } else {
                        relations.push(relation);
                    }
                });

                // Assign the relations to the options passed to fetch/All
                (0, _lodash.assign)(opts, { withRelated: relations });
            }
        };

        /**
         * Build a query based on the `sort` parameter.
         * @param  sortValues {array}
         */
        internals.buildSort = function () {
            var sortValues = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];


            if ((0, _lodash.isArray)(sortValues) && !(0, _lodash.isEmpty)(sortValues)) {

                var sortDesc = [];

                for (var i = 0; i < sortValues.length; ++i) {

                    // Determine if the sort should be descending
                    if (typeof sortValues[i] === 'string' && sortValues[i][0] === '-') {
                        sortValues[i] = sortValues[i].substring(1);
                        sortDesc.push(sortValues[i]);
                    }
                }

                // Format column names according to Model settings
                sortDesc = internals.formatColumnNames(sortDesc);
                sortValues = internals.formatColumnNames(sortValues);

                (0, _lodash.forEach)(sortValues, function (sortBy) {

                    internals.model.orderBy(sortBy, sortDesc.indexOf(sortBy) === -1 ? 'asc' : 'desc');
                });
            }
        };

        /**
         * Build a query based on the `group` parameter.
         * @param  groupValues {array}
         */
        internals.buildGroup = function () {
            var groupValues = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];


            if ((0, _lodash.isArray)(groupValues) && !(0, _lodash.isEmpty)(groupValues)) {

                groupValues = internals.formatColumnNames(groupValues);

                internals.model.query(function (qb) {

                    (0, _lodash.forEach)(groupValues, function (groupBy) {

                        qb.groupBy(groupBy);
                    });
                });
            }
        };

        /**
         * Processes incoming parameters that represent columns names and
         * formats them using the internal {@link Model#format} function.
         * @param  columnNames {array}
         * @return {array{}
         */
        internals.formatColumnNames = function () {
            var columnNames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];


            (0, _lodash.forEach)(columnNames, function (value, key) {

                var columns = {};
                if ((0, _lodash.includes)(value, '.')) {
                    columns[columnNames[key].substr(columnNames[key].lastIndexOf('.') + 1)] = undefined;
                    columnNames[key] = columnNames[key].substring(0, columnNames[key].lastIndexOf('.')) + '.' + (0, _lodash.keys)(_this.format(columns));
                } else if ((0, _lodash.isArray)(value) && key === '' && value.length === 1 && (0, _lodash.includes)(value[0], '.')) {
                    columns[value[0].substr(value[0].lastIndexOf('.') + 1)] = undefined;
                    value[0] = value[0].substring(0, value[0].lastIndexOf('.')) + '.' + (0, _lodash.keys)(_this.format(columns));
                } else {
                    // Convert column names to an object so it can
                    // be passed to Model#format
                    if ((0, _lodash.isArray)(columnNames[key])) {
                        columns = (0, _lodash.zipObject)(columnNames[key], null);
                    } else {
                        columns = (0, _lodash.zipObject)(columnNames, null);
                    }

                    // Format column names using Model#format
                    if ((0, _lodash.isArray)(columnNames[key])) {
                        columnNames[key] = (0, _lodash.keys)(_this.format(columns));
                    } else {
                        columnNames = (0, _lodash.keys)(_this.format(columns));
                    }
                }
            });

            return columnNames;
        };

        /**
         * Determines if the specified relation is a `belongsTo` type.
         * @param   relationName {string}
         * @param   model {object}
         * @return  {boolean}
         */
        internals.isBelongsToRelation = function (relationName, model) {

            if (!model.related(relationName)) {
                return false;
            }
            var relationType = model.related(relationName).relatedData.type.toLowerCase();

            if (relationType !== undefined && relationType === 'belongsto') {

                return true;
            }

            return false;
        };

        /**
         * Determines if the specified relation is a `many` type.
         * @param   relationName {string}
         * @param   model {object}
         * @return  {boolean}
         */
        internals.isManyRelation = function (relationName, model) {

            if (!model.related(relationName)) {
                return false;
            }
            var relationType = model.related(relationName).relatedData.type.toLowerCase();

            if (relationType !== undefined && relationType.indexOf('many') > 0) {

                return true;
            }

            return false;
        };

        /**
         * Determines if the specified relation is a `hasone` type.
         * @param   relationName {string}
         * @param   model {object}
         * @return  {boolean}
         */
        internals.ishasOneRelation = function (relationName, model) {

            if (!model.related(relationName)) {
                return false;
            }
            var relationType = model.related(relationName).relatedData.type.toLowerCase();

            if (relationType !== undefined && relationType === 'hasone') {

                return true;
            }

            return false;
        };

        ////////////////////////////////
        /// Process parameters
        ////////////////////////////////

        // Apply relational dependencies for filters, grouping and sorting
        internals.buildDependencies(filter, group, sort);

        // Apply filters
        internals.buildFilters(filter);

        // Apply grouping
        internals.buildGroup(group);

        // Apply sorting
        internals.buildSort(sort);

        // Apply relations
        internals.buildIncludes(include);

        // Apply sparse fieldsets
        internals.buildFields(fields);

        // Apply extra query which was passed in as a parameter
        if ((0, _lodash.isFunction)(additionalQuery)) {
            internals.model.query(additionalQuery);
        }

        // Assign default paging options if they were passed to the plugin
        // and no pagination parameters were passed directly to the method.
        if (isCollection && (0, _lodash.isEmpty)(page) && (0, _lodash.has)(options, 'pagination')) {

            (0, _lodash.assign)(page, options.pagination);
        }

        // Apply paging
        if (isCollection && (0, _lodash.isObject)(page) && !(0, _lodash.isEmpty)(page)) {

            var pageOptions = (0, _lodash.assign)(opts, page);

            return internals.model.fetchPage(pageOptions);
        }

        // Determine whether to return a Collection or Model

        // Call `fetchAll` to return Collection
        if (isCollection) {
            return internals.model.fetchAll(opts);
        }

        // Otherwise, call `fetch` to return Model
        return internals.model.fetch(opts);
    };

    // Add `fetchJsonApi()` method to Bookshelf Model/Collection prototypes
    Bookshelf.Model.prototype.fetchJsonApi = fetchJsonApi;

    Bookshelf.Model.fetchJsonApi = function () {
        var _forge;

        return (_forge = this.forge()).fetchJsonApi.apply(_forge, arguments);
    };

    Bookshelf.Collection.prototype.fetchJsonApi = function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        return fetchJsonApi.apply.apply(fetchJsonApi, [this.model.forge()].concat(args));
    };
};

module.exports = exports['default'];