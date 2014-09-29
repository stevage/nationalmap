'use strict';

/*global require,ga*/

var CameraFlightPath = require('../../third_party/cesium/Source/Scene/CameraFlightPath');
var CesiumMath = require('../../third_party/cesium/Source/Core/Math');
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var defined = require('../../third_party/cesium/Source/Core/defined');
var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
var DeveloperError = require('../../third_party/cesium/Source/Core/DeveloperError');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');
var Rectangle = require('../../third_party/cesium/Source/Core/Rectangle');
var Scene = require('../../third_party/cesium/Source/Scene/Scene');

var GeoDataItemViewModel = require('./GeoDataItemViewModel');
var inherit = require('../inherit');
var NowViewingViewModel = require('./NowViewingViewModel');
var rectangleToLatLngBounds = require('../rectangleToLatLngBounds');

/**
 * A data source in a {@link GeoDataGroupViewModel}.
 *
 * @alias GeoDataSourceViewModel
 * @constructor
 * @extends GeoDataItemViewModel
 *
 * @param {GeoDataCatalogContext} context The context for the item.
 */
var GeoDataSourceViewModel = function(context) {
    GeoDataItemViewModel.call(this, context);

    this._enabledDate = undefined;
    this._shownDate = undefined;

    /**
     * Gets or sets the geographic rectangle containing this data source.  This property is observable.
     * @type {Rectangle}
     */
    this.rectangle = Rectangle.MAX_VALUE;

    /**
     * Gets or sets the URL of the legend for this data source, or undefined if this data source does not have a legend.
     * This property is observable.
     * @type {String}
     */
    this.legendUrl = undefined;

    /**
     * Gets or sets the type of the {@link GeoDataSourceViewModel#dataUrl}, or undefined if raw data for this data
     * source is not available.  This property is observable.
     * Valid values are:
     *  * `direct` - A direct link to the data.
     *  * `wfs` - A Web Feature Service (WFS) base URL.  If {@link GeoDataSourceViewModel#dataUrl} is not
     *            specified, the base URL will be this data source's URL.
     *  * `wfs-complete` - A complete, ready-to-use link to download features from a WFS server.
     * @type {String}
     */
    this.dataUrlType = undefined;

    /**
     * Gets or sets the URL from which this data item's raw data can be retrieved, or undefined if raw data for
     * this data source is not available.  This property is observable.
     * @type {String}
     */
    this.dataUrl = undefined;

    /**
     * Gets or sets a description of the custodian of this data source.
     * This property is an HTML string that must be sanitized before display to the user.
     * This property is observable.
     * @type {String}
     */
    this.dataCustodian = 'Unknown';

    /**
     * Gets or sets the URL from which this data source's metadata description can be retrieved, or undefined if
     * metadata is not available for this data source.  The format of the metadata depends on the type of data source.
     * For example, Web Map Service (WMS) data sources provide their metadata via their GetCapabilities document.
     * This property is observable.
     * @type {String}
     */
    this.metadataUrl = undefined;

    /**
     * Gets or sets a value indicating whether this data item is enabled.  An enabled data item appears in the
     * "Now Viewing" pane, but is not necessarily shown on the map.  This property is observable.
     * @type {Boolean}
     */
    this.isEnabled = false;

    /**
     * Gets or sets a value indicating whether this data item is currently shown on the map.  In order to be shown,
     * the item must also be enabled.  This property is observable.
     * @type {Boolean}
     */
    this.isShown = false;

    /**
     * Gets or sets a value indicating whether the legend for this data source is currently visible.
     * This property is observable.
     * @type {Boolean}
     */
    this.isLegendVisible = false;

    knockout.track(this, ['isEnabled', 'isShown', 'isLegendVisible']);

    knockout.getObservable(this, 'isEnabled').subscribe(function(newValue) {
        isEnabledChanged(this);
    }, this);

    knockout.getObservable(this, 'isShown').subscribe(function(newValue) {
        isShownChanged(this);
    }, this);
};

GeoDataSourceViewModel.prototype = inherit(GeoDataItemViewModel.prototype);

var imageUrlRegex = /[.\/](png|jpg|jpeg|gif)/i;

defineProperties(GeoDataSourceViewModel.prototype, {
    /**
     * Gets a value indicating whether this data source, when enabled, can be reordered with respect to other data sources.
     * Data sources that cannot be reordered are typically displayed above reorderable data sources.
     * @type {Boolean}
     */
    supportsReordering : {
        get : function() {
            return false;
        }
    },

    /**
     * Gets a value indicating whether the opacity of this data source can be changed.
     * @type {Boolean}
     */
    supportsOpacity : {
        get : function() {
            return false;
        }
    },

    hasLegend : {
        get : function() {
            return defined(this.legendUrl) && this.legendUrl.length > 0;
        }
    },

    legendIsImage : {
        get : function() {
            if (!defined(this.legendUrl) || this.legendUrl.length === 0) {
                return false;
            }

            return this.legendUrl.match(imageUrlRegex);
        }
    }
});

/**
 * Toggles the {@link GeoDataSourceViewModel#isEnabled} property of this item.  If it is enabled, calling this method
 * will disable it.  If it is disabled, calling this method will enable it.
 *
 * @returns {Boolean} true if the item is now enabled, false if it is now disabled.
 */
 GeoDataSourceViewModel.prototype.toggleEnabled = function() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
};

/**
 * Toggles the {@link GeoDataSourceViewModel#isShown} property of this item.  If it is shown, calling this method
 * will hide it.  If it is hidden, calling this method will show it.
 *
 * @returns {Boolean} true if the item is now shown, false if it is now hidden.
 */
 GeoDataSourceViewModel.prototype.toggleShown = function() {
    this.isShown = !this.isShown;
    return this.isShown;
};

/**
 * Toggles the {@link GeoDataSourceViewModel#isLegendVisible} property of this item.  If it is visible, calling this
 * method will hide it.  If it is hidden, calling this method will make it visible.
 * @return {Boolean} true if the legend is now visible, false if it is now hidden.
 */
GeoDataSourceViewModel.prototype.toggleLegendVisible = function() {
    this.isLegendVisible = !this.isLegendVisible;
    return this.isLegendVisible;
};

var scratchRectangle = new Rectangle();

/**
 * Moves the camera so that the item's bounding rectangle is visible.
 */
 GeoDataSourceViewModel.prototype.zoomTo = function() {
    if (!this.isEnabled || !this.isShown || !defined(this.rectangle)) {
        return;
    }

    if (this.rectangle.east - this.rectangle.west > 3.14) {
        console.log('Extent is wider than half the world.  Ignoring zoomto');
        return;
    }

    ga('send', 'event', 'dataSource', 'zoomTo', this.name);

    var epsilon = CesiumMath.EPSILON3;

    var rect = Rectangle.clone(this.rectangle, scratchRectangle);

    if (rect.east - rect.west < epsilon) {
        rect.east += epsilon;
        rect.west -= epsilon;
    }

    if (rect.north - rect.south < epsilon) {
        rect.north += epsilon;
        rect.south -= epsilon;
    }

    var context = this.context;

    if (defined(context.cesiumScene)) {
        var flight = CameraFlightPath.createTweenRectangle(context.cesiumScene, {
            destination : rect
        });
        context.cesiumScene.tweens.add(flight);
    }

    if (defined(context.leafletMap)) {
        context.leafletMap.fitBounds(rectangleToLatLngBounds(rect));
    }
};

function isEnabledChanged(viewModel) {
    var context = viewModel.context;

    if (defined(context.cesiumScene)) {
        if (viewModel.isEnabled) {
            viewModel.enableInCesium();
        } else {
            viewModel.disableInCesium();
        }
    }

    if (defined(context.leafletMap)) {
        if (viewModel.isEnabled) {
            viewModel.enableInLeaflet();
        } else {
            viewModel.disableInLeaflet();
        }
    }

    // Newly-enabled data sources should initially be shown.
    if (viewModel.isEnabled && !viewModel.isShown) {
        viewModel.isShown = true;
    }

    if (viewModel.isEnabled) {
        context.nowViewing.add(viewModel);

        ga('send', 'event', 'dataSource', 'added', viewModel.name);
        viewModel._enabledDate = Date.now();
    } else {
        context.nowViewing.remove(viewModel);

        var duration;
        if (viewModel._enabledDate) {
            duration = ((Date.now() - viewModel._enabledDate) / 1000.0) | 0;
        }
        ga('send', 'event', 'dataSource', 'removed', viewModel.name, duration);
    }
}

function isShownChanged(viewModel) {
    var context = viewModel.context;

    if (defined(context.cesiumScene)) {
        if (viewModel.isShown) {
            viewModel.showInCesium();
        } else {
            viewModel.hideInCesium();
        }
    }

    if (defined(context.leafletMap)) {
        if (viewModel.isShown) {
            viewModel.showInLeaflet();
        } else {
            viewModel.hideInLeaflet();
        }
    }

    if (viewModel.isShown) {
        ga('send', 'event', 'dataSource', 'shown', viewModel.name);
        viewModel._shownDate = Date.now();
    } else {
        var duration;
        if (defined(viewModel._shownDate)) {
            duration = ((Date.now() - viewModel._shownDate) / 1000.0) | 0;
        } else if (viewModel._enabledDate) {
            duration = ((Date.now() - viewModel._enabledDate) / 1000.0) | 0;
        }
        ga('send', 'event', 'dataSource', 'hidden', viewModel.name, duration);
    }
}

module.exports = GeoDataSourceViewModel;
