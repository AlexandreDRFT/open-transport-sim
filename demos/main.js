/* jshint -W033 */


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

    var waypoints = []
    var stations = []

    var train_marker = null

    //CONSTANTES DE CONDUITE
    var stades_vitesse = [
        -5, /* FREINAGE D'URGENCE */
        -4, -3, -2, -1, /* FREINAGE CLASSIQUE */
        0, /* IDLE + FREINAGE DESSERE */
        1, 2, 3, 4, 5 /* ACCELERATION */
    ]
    var drag = 1
    var stade_actuel = 8
    var vitesse_actuelle = 0


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

            if (key.isPressed('up') && !blocage) {
                blocage = true
                var way_ids = []

                //Code basé sur overpass api (ligne14.json)
                fetch('../ligne14.json')
                    .then(response => response.json())
                    .then(obj => { //Démonstration de l'acquisition des données
                        let node_depart = obj.elements[0]

                        var [next_way, is_first_point] = get_way_with_node(node_depart.id, obj)
                        var connecting_waypoint = is_first_point ? next_way.nodes[0] : next_way.nodes[next_way.nodes.length - 1];

                        var id_display = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(4) > div > span")
                        var name_display = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(5) > div > span")

                        try {
                            //while (next_way != null) {
                            for (var i = 0; i <= 10; i++) {
                                way_ids.push(next_way.id)

                                console.log("SECTION " + i + " connected by waypoint " + connecting_waypoint)
                                console.log(next_way)

                                get_sorted_nodes(next_way, connecting_waypoint).forEach(node => {
                                    waypoints.push(get_coords_of_node(node, obj))

                                    var node_name = get_name_of_node(node, obj)
                                    if (node_name != null && !stations.includes(node_name)) {
                                        stations.push(node_name)
                                    }
                                })

                                var temp = get_next_way_of_way(next_way, way_ids, obj)
                                is_first_point = temp[1]
                                connecting_waypoint = is_first_point ? next_way.nodes[0] : next_way.nodes[next_way.nodes.length - 1];
                                next_way = temp[0]
                            }
                        } catch {
                            console.log("Fin de l'acquisition de la ligne")
                        }
                        console.log(waypoints.length)
                        if(waypoints.length < 40) {
                            alert("Le nombre d'arrêts est anormalement court. Il y a une erreur sur OpenStreetMap.")
                        } else {
                            document.querySelector("body > div.dg.ac > div > ul > li:nth-child(1) > div").textContent = "Line loaded !"
                        }
                        
                        setTimeout(() => {
                            blocage = false
                            console.log("Vous pouvez commencer à conduire !")
                        }, 1000);
                    })
            }

            if (key.isPressed('down') && !blocage) { //Démonstration de la conduite
                console.log("Module de conduite chargé.")
                blocage = true
                train_marker = L.motion.polyline(waypoints, {

                }, {
                    auto: true,
                    speed: 1000
                }, {
                    title: "2555641",
                }).addTo(map);
                train_marker.motionStart();
            }

            if (train_marker != null) {
                map.flyTo(train_marker.__marker._latlng)

                /* MAJ DES VARIABLES DE CONDUITE */
                //vitesse_actuelle = vitesse_actuelle - drag + stades_vitesse[stade_actuel] * 0.1
                //train_marker.motionSpeed(100)
                //train_marker.motionSpeed(vitesse_actuelle)
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


    //OTS FUNCTIONS
    function get_way_with_node(id, json) {
        var trouve = false
        var i = 0
        while (!trouve && i < json.elements.length) {
            if (json.elements[i].nodes) {
                trouve = json.elements[i].nodes.includes(id)
            }
            i++
        }

        if (trouve)
            return [json.elements[i - 1], false]

        return [null, null]
    }

    function get_next_way_of_way(way, way_list, json) {
        var first_point_id = way.nodes[0]
        var last_point_id = way.nodes[way.nodes.length - 1]

        var trouve = false
        var i = 0
        while (!trouve && i < json.elements.length) {
            if (json.elements[i].nodes) {
                trouve = (json.elements[i].nodes.includes(first_point_id) || json.elements[i].nodes.includes(last_point_id)) && !way_list.includes(json.elements[i].id) && !arrayEquals(way.nodes, json.elements[i].nodes)
            }
            i++
        }

        if (trouve)
            return [json.elements[i - 1], json.elements[i - 1].nodes.includes(first_point_id)]
        return [null, null]
    }

    function get_sorted_nodes(way, connecting_waypoint_id) {
        if (way.nodes.indexOf(connecting_waypoint_id) >= way.nodes.length / 2) {
            console.log("This section was reversed")
            return way.nodes.reverse()
        }
        return way.nodes
    }

    function get_coords_of_node(node_id, json) {
        let node = json.elements.find(el => el.id == node_id)
        return [node.lat, node.lon]
    }

    function get_name_of_node(node_id, json) {
        let node = json.elements.find(el => el.id == node_id)
        if (node.tags && node.tags.name)
            return node.tags.name
        return null
    }

    function arrayEquals(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length !== b.length) return false;

        for (var i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    //TANGRAM FUNCTIONS
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
