/* jshint -W033 */


(function () {
    var scene_url = 'open-tsim/scene.yaml';

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
        }
    });

    // Create a Leaflet map
    var map = L.map('map', {
        maxZoom: 22,
        zoomSnap: 0,
        keyboard: false
    });
    map.setMaxZoom(50);

    //OBJETS DU JEU
    var blocage = false
    var blocage_commandes = false

    var waypoints = []
    var stations = []
    var stations_waypoints = []

    var train_marker = null

    //CONSTANTES DE CONDUITE (a déplacer dans un fichier config)
    var drag = 0.1
    var game_mode_index = 2 //0 for Simulation, 1 for Faster routes, 2 for Arcade
    var speed_multipliers = [
        1 /* Simulation */ ,
        3 /* Faster routes */ ,
        9 /* Arcade */
    ]
    var speed_multiplier = speed_multipliers[game_mode_index] //for shorter game sessions
    var brake_multiplier = 1.3 //how stronger is breaking compared to accelerating
    var max_speeds = [
        130,
        300,
        4000
    ]
    let max_speed = max_speeds[game_mode_index]

    //VARIABLES DE CONDUITE
    var next_station_index = 0
    var stades_vitesse = [
        -5, /* FREINAGE D'URGENCE */
        -4, -3, -2, -1, /* FREINAGE CLASSIQUE */
        0, /* IDLE + FREINAGE DESSERE */
        1, 2, 3, 4, 5 /* ACCELERATION */
    ]
    var stade_actuel = 6
    var vitesse_actuelle = 0
    var portes_ouvertes = false
    var distance_to_next_station = 1000

    setTimeout(() => {
        document.querySelector("#map > div.leaflet-control-container > div.leaflet-top.leaflet-left > div.leaflet-control-zoom.leaflet-bar.leaflet-control").remove()
        document.querySelector("#map > div.leaflet-control-container > div.leaflet-top.leaflet-left > div.leaflet-pelias-control.leaflet-bar.leaflet-control.leaflet-pelias-expanded > a").remove()
        document.querySelector("body > div.dg.ac > div > ul > li:nth-child(1) > div").textContent = "Press Up to load the line."
    }, 500);


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

            /* LOADING THE LINE */
            if (key.isPressed('up') && !blocage && waypoints.length <= 1) {
                blocage = true
                var way_ids = []

                let barre_statut = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(1) > div")
                barre_statut.textContent = "Chargement de la ligne ..."

                //Code basé sur overpass api
                let line_code = 7911336
                fetch('https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:50];%20(%20relation('+line_code+');%20);%3E;out%20body%20qt;')
                    .then(response => response.json())
                    .then(obj => { //Démonstration de l'acquisition des données
                        var [next_way, is_first_point] = get_starting_way(obj)
                        console.log("The first way is : ")
                        console.log(next_way)
                        console.log("------")
                        var connecting_waypoint = is_first_point ? next_way.nodes[0] : next_way.nodes[next_way.nodes.length - 1];

                        try {
                            var i = 0
                            while (next_way != null) {
                                way_ids.push(next_way.id)

                                console.log("SECTION " + i + " connected by waypoint " + connecting_waypoint)
                                console.log(next_way)

                                get_sorted_nodes(next_way, connecting_waypoint).forEach(node => {
                                    waypoints.push(get_coords_of_node(node, obj))

                                    var node_name = get_name_of_node(node, obj)
                                    if (node_name != null && !stations.includes(node_name)) {
                                        stations.push(node_name)
                                        stations_waypoints.push(get_coords_of_node(node, obj))
                                    }
                                })

                                var temp = get_next_way_of_way(next_way, way_ids, obj)
                                is_first_point = temp[1]
                                connecting_waypoint = is_first_point ? next_way.nodes[0] : next_way.nodes[next_way.nodes.length - 1];
                                next_way = temp[0]

                                i++
                            }
                        } catch (error) {
                            console.error(error)
                            console.log("-- Fin de l'acquisition de la ligne --")
                        }
                        console.log(waypoints.length + " waypoints")
                        console.log(stations)
                        if (waypoints.length < 40) {
                            //alert("Le nombre d'arrêts est anormalement court. Il y a une erreur sur OpenStreetMap.")
                            //TODO vider et recommencer l'acquisition en demandant de choisir le starting node manuellement
                        } else {
                            if (next_way && next_way.tags && next_way.tags.name) {
                                barre_statut.textContent = next_way.tags.name
                            } else {
                                barre_statut.textContent = "Line successfully loaded."
                            }
                        }

                        setTimeout(() => {
                            blocage = false
                            console.log("Train ajouté à la ligne.")
                            barre_statut.textContent = "Press Down to start driving."
                        }, 700);
                    })
            }

            /* START DRIVING */
            if (key.isPressed('down') && !blocage && waypoints.length > 1) {
                console.log("Module de conduite chargé.")
                blocage = true
                train_marker = L.motion.polyline(waypoints, {
                    color: "transparent"
                }, {
                    auto: true,
                    speed: 1
                }, {
                    title: "2555641",
                    icon: L.divIcon({
                        html: "<img src='train.svg' style='width: 40px; height: 40px;'></img>",
                        iconSize: L.point(27.5, 24)
                    })
                }).addTo(map);
                train_marker.motionStart();

                let data_bar = document.querySelector("div.leaflet-pelias-control > input")
                let name_display = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(4) > div > span")
                let barre_statut = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(1) > div")
                var distance_display = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(5) > div > span")

                //FIRST DISPLAY
                barre_statut.textContent = "Les portes sont fermées."
                data_bar.setAttribute("placeholder", "LEVIER DE TRACTION : " + stades_vitesse[stade_actuel] + " / VITESSE : " + Math.round(vitesse_actuelle))
                distance_display.textContent = "Distance to next station : " + 100 * ((stations_waypoints[next_station_index][0] - train_marker.__marker._latlng.lat) + (stations_waypoints[next_station_index][1] - train_marker.__marker._latlng.lng)) //get_distance(stations_waypoints[next_station_index], train_marker.__marker._latlng))
                data_bar.setAttribute('size', data_bar.getAttribute('placeholder').length);
                name_display.textContent = "Next station : " + stations[next_station_index]

                setInterval(function (train_marker) {
                    /* BOUCLE DE MAJ DES VARIABLES DE CONDUITE */
                    if (stades_vitesse[stade_actuel] > 0) { //ACCELERATION
                        if (vitesse_actuelle >= max_speed) {
                            vitesse_actuelle = max_speed
                        } else {
                            vitesse_actuelle = vitesse_actuelle - drag * speed_multiplier + stades_vitesse[stade_actuel] * speed_multiplier
                        }
                    } else { //FREINAGE
                        if (vitesse_actuelle <= 0.01) {
                            vitesse_actuelle = 0.01
                        } else {
                            vitesse_actuelle = vitesse_actuelle - drag * speed_multiplier + stades_vitesse[stade_actuel] * speed_multiplier * brake_multiplier
                        }
                    }

                    data_bar.setAttribute("placeholder", "LEVIER DE TRACTION : " + stades_vitesse[stade_actuel] + " / VITESSE : " + Math.round(vitesse_actuelle)) //get_distance(stations_waypoints[next_station_index], train_marker.__marker._latlng))
                    train_marker.motionSpeed(vitesse_actuelle)

                    if (vitesse_actuelle > 0.01) {
                        distance_to_next_station = Math.abs(Math.round(100000 * ((stations_waypoints[next_station_index][0] - train_marker.__marker._latlng.lat) + (stations_waypoints[next_station_index][1] - train_marker.__marker._latlng.lng)))) //get_distance(stations_waypoints[next_station_index], train_marker.__marker._latlng))
                        if (distance_to_next_station != undefined) {
                            distance_display.textContent = "Distance to next station : " + distance_to_next_station

                            if(distance_to_next_station < 250) {
                                //Màj de la prochaine station
                                next_station_index++
                                name_display.textContent = stations[next_station_index]
                            }
                        }
                    }

                    /* --- FIN BOUCLE DE MAJ DES VARIABLES DE CONDUITE ---*/
                }, 200, train_marker)
            }

            /* DECCELERATE */
            if (key.isPressed('left') && !blocage_commandes) {
                blocage_commandes = true
                stade_actuel = (stade_actuel > 0) ? stade_actuel - 1 : stade_actuel;

                setTimeout(() => {
                    blocage_commandes = false
                }, 300);
            }

            /* ACCELERATE */
            if (key.isPressed('right') && !blocage_commandes) {
                blocage_commandes = true
                stade_actuel = (stade_actuel < stades_vitesse.length - 1) ? stade_actuel + 1 : stade_actuel;

                setTimeout(() => {
                    blocage_commandes = false
                }, 300);
            }

            /* OPEN DOORS */
            if (key.isPressed('enter') && !blocage_commandes) {
                let barre_statut = document.querySelector("body > div.dg.ac > div > ul > li:nth-child(1) > div")

                blocage_commandes = true
                if (stades_vitesse[stade_actuel] < 0 && !portes_ouvertes) {
                    barre_statut.textContent = "Les portes sont ouvertes ..."
                    portes_ouvertes = true
                    setTimeout(() => {
                        barre_statut.textContent = "Tous les passagers sont montés !"
                    }, 10000);
                } else if (stades_vitesse[stade_actuel] <= 0 && portes_ouvertes) {
                    barre_statut.textContent = "Les portes se ferment ..."
                    portes_ouvertes = false
                    setTimeout(() => {
                        barre_statut.textContent = "Les portes sont fermées."
                    }, 3000);
                } else {
                    barre_statut.textContent = "Serrez le frein avant d'ouvrir les portes !"
                }

                setTimeout(() => {
                    blocage_commandes = false
                }, 500);
            }

            if (key.isPressed('h') && !blocage) {
                blocage = true
                console.log("DEBUG/ SELECTION D'UNE NOUVELLE LIGNE")


                fetch('https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%5Btimeout%3A50%5D%3B%0A%28%0A%20%20relation%2848.68960056688%2C2.097015380859375%2C48.99283383694351%2C2.676544189453125%29%5Broute%3Dsubway%5D%5Btype%3Droute%5D%3B%0A%20%20relation%2848.68960056688%2C2.097015380859375%2C48.99283383694351%2C2.676544189453125%29%5Broute%3Dtrain%5D%5Btype%3Droute%5D%3B%0A%29%3B%0Aout%20tags%20asc%3B%0A')
                    .then(response => response.json())
                    .then(obj => { //Démonstration de l'acquisition des données dynamique
                        const line_list = obj.elements.map(el => el.tags.name).sort()
                        console.log(line_list)

                        // instanciate new modal
                        var modal = new tingle.modal({
                            footer: true,
                            stickyFooter: false,
                            closeMethods: ['overlay', 'button', 'escape'],
                            closeLabel: "Close",
                            cssClass: ['custom-class-1', 'custom-class-2'],
                            onOpen: function () {
                                console.log('modal open');
                            },
                            onClose: function () {
                                console.log('modal closed');
                            },
                            beforeClose: function () {
                                // here's goes some logic
                                // e.g. save content before closing the modal
                                return true; // close the modal
                                return false; // nothing happens
                            }
                        });

                        // set content
                        modal.setContent('<p>'+line_list.map(e=> e + "<br>" )+'</p>');

                        // add a button
                        modal.addFooterBtn('Button label', 'tingle-btn tingle-btn--primary', function () {
                            // here goes some logic
                            modal.close();
                        });

                        // add another button
                        modal.addFooterBtn('Dangerous action !', 'tingle-btn tingle-btn--danger', function () {
                            // here goes some logic
                            modal.close();
                        });

                        // open modal
                        modal.open();

                        setTimeout(() => {
                            blocage = false
                        }, 200);
                    })


            }

            /* UPDATE GAME CAMERA */
            if (train_marker != null && vitesse_actuelle > 0.01) {
                map.flyTo(train_marker.__marker._latlng)
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
    function get_distance(latlng1, latlng2) {
        const R = 6371e3; // metres
        const φ1 = latlng1[0] * Math.PI / 180; // φ, λ in radians
        const φ2 = latlng2.lat * Math.PI / 180;
        const Δφ = (latlng2.lat - latlng1[0]) * Math.PI / 180;
        const Δλ = (latlng2.lng - latlng1[1]) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const d = R * c;
        return d;
    }

    function get_starting_way(json) {
        var trouve = false
        var i = 0
        var node
        var temp_way_ids = []

        while (!trouve && i < json.elements.length) {
            node = json.elements[i]
            trouve = node.tags && node.tags.name
            i++
        }

        if (trouve) {
            //search for starting and end nodes
            var [next_way, is_first_point] = get_way_with_node(node.id, json)
            console.log("first station on ")
            console.log(next_way)
            var is_first_point
            var starting_way

            while (next_way != null) {
                temp_way_ids.push(next_way.id)
                var temp = get_next_way_of_way(next_way, temp_way_ids, json)

                if (temp[0] != null) {
                    next_way = temp[0]
                    is_first_point = temp[1]
                } else {
                    starting_way = next_way
                    console.log("final start way is")
                    console.log(starting_way)
                    next_way = null
                }
            }

            return [starting_way, is_first_point]
        }

        alert("ERROR: There's no starting node on this line or stations are wrongly tagged.")
    }

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
            //console.log("This section was reversed")
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
