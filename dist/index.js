'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _lodash = require('lodash');

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
    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];


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
        var _this = this;

        var isCollection = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
        var type = arguments[2];


        opts = opts || {};

        var internals = {};
        var _opts = opts;
        var include = _opts.include;
        var fields = _opts.fields;
        var sort = _opts.sort;
        var _opts$page = _opts.page;
        var page = _opts$page === undefined ? {} : _opts$page;
        var filter = _opts.filter;

        // Get a reference to the field being used as the id

        internals.idAttribute = this.constructor.prototype.idAttribute ? this.constructor.prototype.idAttribute : 'id';

        // Get a reference to the current model name. Note that if no type is
        // explcitly passed, the tableName will be used
        internals.modelName = type ? type : this.constructor.prototype.tableName;

        // Initialize an instance of the current model and clone the initial query
        internals.model = this.constructor.forge().query(function (qb) {
            return (0, _lodash.assign)(qb, _this.query().clone());
        });

        /**
         * Build a query based on the `fields` parameter.
         * @param  fieldNames {object}
         */
        internals.buildFields = function () {
            var fieldNames = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];


            if ((0, _lodash.isObject)(fieldNames) && !(0, _lodash.isEmpty)(fieldNames)) {

                // Format column names
                fieldNames = internals.formatColumnNames(fieldNames);

                // Process fields for each type/relation
                (0, _lodash.forEach)(fieldNames, function (fieldValue, fieldKey) {

                    // Add qualifying table name to avoid ambiguous columns
                    fieldNames[fieldKey] = (0, _lodash.map)(fieldNames[fieldKey], function (value) {

                        return fieldKey + '.' + value;
                    });

                    // Only process the field if it's not a relation. Fields
                    // for relations are processed in `buildIncludes()`
                    if (!(0, _lodash.includes)(include, fieldKey)) {

                        // Add column to query
                        internals.model.query(function (qb) {

                            qb.column.apply(qb, [fieldValue]);

                            // JSON API considers relationships as fields, so we
                            // need to make sure the id of the relation is selected
                            (0, _lodash.forEach)(include, function (relation) {

                                var relationId = relation + '_id';

                                if (!internals.isManyRelation(relation) && !(0, _lodash.includes)(fieldNames[relation], relationId)) {

                                    qb.column.apply(qb, [relationId]);
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
                filterValues = _this.format(filterValues);

                // build the filter query
                internals.model.query(function (qb) {

                    (0, _lodash.forEach)(filterValues, function (value, key) {

                        // Determine if there are multiple filters to be applied
                        value = value.toString().indexOf(',') !== -1 ? value.split(',') : value;

                        qb.whereIn.apply(qb, [key, value]);
                    });
                });
            }
        };

        /**
         * Build a query based on the `include` parameter.
         * @param  includeValues {array}
         */
        internals.buildIncludes = function (includeValues) {

            if ((0, _lodash.isArray)(includeValues) && !(0, _lodash.isEmpty)(includeValues)) {
                (function () {

                    var relations = [];

                    (0, _lodash.forEach)(includeValues, function (relation) {

                        if ((0, _lodash.has)(fields, relation)) {
                            (function () {

                                var fieldNames = internals.formatColumnNames(fields);

                                relations.push(_defineProperty({}, relation, function (qb) {

                                    var relationId = internals.modelName + '_id';

                                    if (!internals.isBelongsToRelation(relation) && !(0, _lodash.includes)(fieldNames[relation], relationId)) {

                                        qb.column.apply(qb, [relationId]);
                                    }

                                    qb.column.apply(qb, [fieldNames[relation]]);
                                }));
                            })();
                        } else {
                            relations.push(relation);
                        }
                    });

                    // Assign the relations to the options passed to fetch/All
                    (0, _lodash.assign)(opts, { withRelated: relations });
                })();
            }
        };

        /**
         * Build a query based on the `sort` parameter.
         * @param  sortValues {array}
         */
        internals.buildSort = function () {
            var sortValues = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

            if ((0, _lodash.isArray)(sortValues) && !(0, _lodash.isEmpty)(sortValues)) {
                (function () {

                    var sortDesc = [];

                    var relations = [];

                    for (var i = 0; i < sortValues.length; ++i) {
                        var desc = false;
                        // Determine if the sort should be descending
                        if (typeof sortValues[i] === 'string' && (sortValues[i][0] === '-' || sortValues[i][0] === '_')) {
                            sortValues[i] = sortValues[i].substring(1, sortValues[i].length);
                            desc = true;
                        }

                        if (sortValues[i].indexOf('.') !== -1) {
                            var pair = sortValues[i].split('.');
                            relations.push(pair[0]);
                            sortValues[i] = pair[1];
                        } else {
                            relations.push('');
                        }

                        if (desc) {
                            sortDesc.push(sortValues[i]);
                        }
                    }

                    // Format column names according to Model settings
                    sortDesc = internals.formatColumnNames(sortDesc);
                    sortValues = internals.formatColumnNames(sortValues);

                    (0, _lodash.forEach)(sortValues, function (sortBy, idx) {
                        var column = sortBy;
                        if (relations[idx] !== '') {
                            column = relations[idx] + '.' + sortBy;
                        };
                        internals.model.orderBy(column, sortDesc.indexOf(sortBy) === -1 ? 'asc' : 'desc');
                    });
                })();
            }
        };

        /**
         * Processes incoming parameters that represent columns names and
         * formats them using the internal {@link Model#format} function.
         * @param  columnNames {array}
         * @return {array{}
         */
        internals.formatColumnNames = function () {
            var columnNames = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];


            (0, _lodash.forEach)(columnNames, function (value, key) {

                var columns = void 0;

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
            });

            return columnNames;
        };

        /**
         * Determines if the specified relation is a `belongsTo` type.
         * @param  relationName {string}
         * @return {boolean}
         */
        internals.isBelongsToRelation = function (relationName) {

            var relationType = _this.related(relationName).relatedData.type.toLowerCase();

            if (relationType !== undefined && relationType === 'belongsto') {

                return true;
            }

            return false;
        };

        /**
         * Determines if the specified relation is a `many` type.
         * @param  relationName {string}
         * @return {boolean}
         */
        internals.isManyRelation = function (relationName) {

            var relationType = _this.related(relationName).relatedData.type.toLowerCase();

            if (relationType !== undefined && relationType.indexOf('many') > 0) {

                return true;
            }

            return false;
        };

        ////////////////////////////////
        /// Process parameters
        ////////////////////////////////

        // Apply filters
        internals.buildFilters(filter);

        // Apply sorting
        internals.buildSort(sort);

        // Apply relations
        internals.buildIncludes(include);

        // Apply sparse fieldsets
        internals.buildFields(fields);

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
