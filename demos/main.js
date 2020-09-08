/*
    Hello source-viewers!
    We're glad you're interested in how Tangram can be used to make amazing maps!
    - The Tangram team
*/

(function () {
    var scene_url = 'demos/scene.yaml';

    // optionally override scene URL
    if ('URLSearchParams' in window) {
        var params = new URLSearchParams(window.location.search);
        if (params.get('scene')) {
            scene_url = params.get('scene');
            if (scene_url[0] === '{') {
                scene_url = JSON.parse(scene_url); // parse JSON-encoded scenes
            }
        }
    }

    // Create Tangram as a Leaflet layer
    var layer = Tangram.leafletLayer({
        scene: scene_url,
        events: {
            hover: onHover, // hover event (defined below)
            click: onClick // click event (defined below)
        },
        debug: {
            // layer_stats: true // enable to collect detailed layer stats, access w/`scene.debug.layerStats()`
            // wireframe: true // enable for wireframe rendering mode
        },
        logLevel: 'debug'
    });

    // Create a Leaflet map
    var map = L.map('map', {
        maxZoom: 22,
        zoomSnap: 0,
        keyboard: false
    });
    var blocage = false
    var line_points = []
    var debut_des_segments = []
    var fin_des_segments = []
    var noms_des_segments = []


    // Useful events to subscribe to
    layer.scene.subscribe({
        load: function (msg) {
            // scene was loaded
        },
        update: function (msg) {
            // scene updated
        },
        pre_update: function (will_render) {
            // before scene update
            // zoom in/out if up/down arrows pressed
            var vitesse = 0.000005;

            if (key.isPressed('up') && !blocage) {
                blocage = true

                //Code basé sur overpass api (ligne14.json)
                fetch('../ligne14.json')
                    .then(response => response.json())
                    .then(obj => {
                        console.log(obj)
                        let node_depart = obj.elements[0]

                        var next_way = get_way_with_node(node_depart.id, obj)
                        console.log(next_way)
                        console.log(get_next_way_of_way(next_way, obj))
                    })


                /*scene.queryFeatures({
                    filter: {
                        $layer: 'transit',
                        kind: 'subway'
                    },
                    group_by: 'ref',
                    geometry: true
                }).then(results => {
                    console.log("queryFeatures")
                    results[14].forEach(line => {
                        console.log(line)
                        console.log("BLOC : " + line_points.length)
                        console.log(line.geometry.coordinates[0])
                        console.log(line.geometry.coordinates[line.geometry.coordinates.length-1])
                        debut_des_segments.push(line.geometry.coordinates[0])
                        fin_des_segments.push(line.geometry.coordinates[line.geometry.coordinates.length-1])
                        noms_des_segments.push(results[14].indexOf(line))

                        line.geometry.coordinates.forEach(feature => {
                            if(feature.length > 2) {
                                feature.forEach(f => {
                                    let latlng = [f[1], f[0]]
                                    if(!arrayAlreadyHasArray(line_points, latlng)) {
                                        L.marker(latlng).addTo(map);
                                        line_points.push(latlng)
                                    }
                                })
                            } else {
                                let latlng = [feature[1], feature[0]]
                                if(!arrayAlreadyHasArray(line_points, latlng)) {
                                    L.marker(latlng).addTo(map);
                                    line_points.push(latlng)
                                }
                            }
                            
                          });
                    })

                    var timeout_value = 1000
                    var j = 0
                    line_points.forEach(point => {
                        var new_pos = {
                            lat: point[0],
                            lng: point[1]
                        }
                        timeout_value += 1000
                        setTimeout(() => {
                            j++
                            console.log(j)
                            map._move(new_pos, map.getZoom());
                            map._moveEnd(true);
                        }, timeout_value);
                    })
                    
                    blocage = false
                })*/

                /*scene.queryFeatures({
                    filter: {
                        $layer: 'transit',
                        kind: 'subway'
                    },
                    group_by: 'ref',
                    geometry: true
                }).then(results => {
                    console.log("iter n1")
                    console.log(results)
                    var timeout_value = 1000

                    //Object.values(results).forEach(line => {
                    let line = Object.values(results)[0]
                    console.log("line n2")
                    console.log(line)
                    document.querySelector("body > div.dg.ac > div > ul > li:nth-child(4) > div > span").textContent = line[0].properties.name

                    line[0].geometry.coordinates.forEach(coord => {
                            var new_pos = {
                                lat: coord[1],
                                lng: coord[0]
                            }
                            timeout_value += 1000
                            setTimeout(() => {
                                map._move(new_pos, map.getZoom());
                                map._moveEnd(true);
                            }, timeout_value);
                    })

                    setTimeout(() => {
                        blocage = false
                        console.log("débloquage")
                    }, timeout_value);
                    //})
                });*/

            }
            if (key.isPressed('down')) {
                var new_pos = {
                    lat: map.getCenter().lat - vitesse,
                    lng: map.getCenter().lng,
                    zoom: 25.0
                }
                map._move(new_pos, map.getZoom());
                map._moveEnd(true);
            }
        },
        post_update: function (will_render) {
            // after scene update
        },
        view_complete: function (msg) {
            // new set of map tiles was rendered
        },
        error: function (msg) {
            // on error
        },
        warning: function (msg) {
            // on warning
        }
    });

    // Feature selection
    var tooltip = L.tooltip();
    layer.bindTooltip(tooltip);
    map.on('zoom', function () {
        layer.closeTooltip()
    }); // close tooltip when zooming

    function get_way_with_node(id, json) {
        var trouve = false
        var i = 0
        while(!trouve && i < json.elements.length) {
            if(json.elements[i].nodes) {
                trouve = json.elements[i].nodes.includes(id)
            }
            i++
        }

        if(trouve)
            return json.elements[i-1]
        else
            return null
    }

    function get_next_way_of_way(way, json) {
        const first_point_id = way.nodes[0]
        const last_point_id = way.nodes[way.nodes.length-1]

        var trouve = false
        var i = 0
        while(!trouve && i < json.elements.length) {
            if(json.elements[i].nodes) {
                trouve = (json.elements[i].nodes.includes(first_point_id) || json.elements[i].nodes.includes(last_point_id)) && json.elements[i].id != way.id
            }
            i++
        }

        if(trouve)
            return json.elements[i-1]
        else
            return null
    }

    function onHover(selection) {
        var feature = selection.feature;
        if (feature) {
            if (selection.changed) {
                var info;
                if (scene.introspection) {
                    info = getFeaturePropsHTML(feature);
                } else {
                    var name = feature.properties.name || feature.properties.kind ||
                        (Object.keys(feature.properties).length + ' properties');
                    name = '<b>' + name + '</b>';
                    name += '<br>(click for details)';
                    name = '<span class="labelInner">' + name + '</span>';
                    info = name;
                }

                if (info) {
                    tooltip.setContent(info);
                }
            }
            layer.openTooltip(selection.leaflet_event.latlng);
        } else {
            layer.closeTooltip();
        }
    }

    function arrayAlreadyHasArray(arr, subarr) {
        for (var i = 0; i < arr.length; i++) {
            let checker = false
            for (var j = 0; j < arr[i].length; j++) {
                if (arr[i][j] === subarr[j]) {
                    checker = true
                } else {
                    checker = false
                    break;
                }
            }
            if (checker) {
                return true
            }
        }
        return false
    }

    function onClick(selection) {
        // Link to edit in Open Street Map on alt+click (opens popup window)
        if (key.alt) {
            var center = map.getCenter();
            var url = 'https://www.openstreetmap.org/edit?#map=' + map.getZoom() + '/' + center.lat + '/' + center.lng;
            window.open(url, '_blank');
            return;
        }

        if (scene.introspection) {
            return; // click doesn't show additional details when introspection is on
        }

        // Show feature details
        var feature = selection.feature;
        if (feature) {
            var info = getFeaturePropsHTML(feature);
            tooltip.setContent(info);
            layer.openTooltip(selection.leaflet_event.latlng);
        } else {
            layer.closeTooltip();
        }
    }

    // Get an HTML fragment with feature properties
    function getFeaturePropsHTML(feature) {
        var props = ['name', 'kind', 'kind_detail', 'id']; // show these properties first if available
        Object.keys(feature.properties) // show rest of proeprties alphabetized
            .sort()
            .forEach(function (p) {
                if (props.indexOf(p) === -1) {
                    props.push(p);
                }
            });

        var info = '<div class="featureTable">';
        props.forEach(function (p) {
            if (feature.properties[p]) {
                info += '<div class="featureRow"><div class="featureCell"><b>' + p + '</b></div>' +
                    '<div class="featureCell">' + feature.properties[p] + '</div></div>';
            }
        });

        // data source and tile info
        info += '<div class="featureRow"><div class="featureCell"><b>tile</b></div>' +
            '<div class="featureCell">' + feature.tile.coords.key + '</div></div>';
        info += '<div class="featureRow"><div class="featureCell"><b>source name</b></div>' +
            '<div class="featureCell">' + feature.source_name + '</div></div>';
        info += '<div class="featureRow"><div class="featureCell"><b>source layer</b></div>' +
            '<div class="featureCell">' + feature.source_layer + '</div></div>';

        // scene layers
        info += '<div class="featureRow"><div class="featureCell"><b>scene layers</b></div>' +
            '<div class="featureCell">' + feature.layers.join('<br>') + '</div></div>';
        info += '</div>';
        return info;
    }

    /*** Map ***/

    window.map = map;
    window.layer = layer;
    window.scene = layer.scene;

    window.addEventListener('load', function () {
        layer.addTo(map);
        layer.bringToFront();
    });
}());
