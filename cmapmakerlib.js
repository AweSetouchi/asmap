"use strict";

// PoiData Control
var poiCont = (function () {
	var pdata = { geojson: [], targets: [], enable: [] };					//poi data variable
	var adata = [], latlngs = {}, geoidx = {};								//act data variable /  poi's latlng & geoidx

	return {
		pois: () => { return { pois: pdata, acts: adata } },
		targets: () => {									// return all targets
			let target = [];
			pdata.targets.forEach(names => target = target.concat(names));	// poisのtarget集計
			if (adata.length > 0) target.concat(Conf.google.targetName);
			return basic.uniq(target);
		},
		all_clear: () => { pdata = { geojson: [], targets: [], enable: [] } },
		set_json: (json) => {								// set GoogleSpreadSheetから帰ってきたJson
			adata = json;
		},
		add_geojson: (pois) => {      						// add geojson pois / pois: {geojson: [],targets: []}
			if (pois.enable == undefined) pois.enable = [];
			pois.geojson.forEach((val1, idx1) => {			// 既存Poiに追加
				let enable = pois.enable[idx1] == undefined ? true : pois.enable[idx1];
				let poi = { "geojson": pois.geojson[idx1], "targets": pois.targets[idx1], "enable": enable };
				poiCont.set_geojson(poi);
			});
			pdata.geojson.forEach((node, node_idx) => {
				let ll, lat = 0, lng = 0, counts = node.geometry.coordinates[0].length;;
				ll = GeoCont.flat2single(node.geometry.coordinates, node.geometry.type);
				latlngs[node.id] = { "lat": ll[1], "lng": ll[0] };
				geoidx[node.id] = node_idx;
			});
		},
		set_geojson: (poi) => {								// add_geojsonのサブ機能
			let cidx = pdata.geojson.findIndex((val) => val.id == poi.geojson.id);
			if (cidx === -1) {       	                   // 無い時は追加
				pdata.geojson.push(poi.geojson);
				cidx = pdata.geojson.length - 1;
			};
			if (pdata.targets[cidx] == undefined) {  	// targetが無い時は追加
				pdata.targets[cidx] = poi.targets;
			} else {
				pdata.targets[cidx] = Object.assign(pdata.targets[cidx], poi.targets);
			};
			if (poi.enable !== undefined) pdata.enable[cidx] = poi.enable;
		},
		get_osmid: (osmid) => {           								// osmidを元にgeojsonと緯度経度、targetを返す
			let idx = geoidx[osmid];
			return idx == undefined ? undefined : { geojson: pdata.geojson[idx], latlng: latlngs[osmid], targets: pdata.targets[idx], enable: pdata.enable[idx] };
		},
		get_actid: (actid) => {
			let act = adata.filter(line => actid == line.id);
			return act == undefined ? undefined : act[0];
		},
		get_catname: (tags) => {          								// get Category Name from Conf.category(Global Variable)
			let categorys = Object.keys(Conf.category);
			let key1 = categorys.find(key => tags[key] !== undefined);
			let key2 = tags[key1] == undefined ? "" : tags[key1];
			let catname = (key2 !== "") ? Conf.category[key1][key2] : "";   // known tags
			return (catname == undefined) ? "" : catname;
		},
		get_wikiname: (tags) => {          								// get Wikipedia Name from tag
			let wikiname = tags["wikipedia"] ? tags["wikipedia"].split(':')[1] : "";	// value値の":"の右側を返す
			return wikiname;
		},
		get_target: (targets) => {										// 指定したtargetのpoisとactsを返す
			let pois = filter_geojson(targets);
			return { "pois": pois, "acts": targets.indexOf(Conf.google.targetName) > -1 ? adata : [] };
		},
		list: function (targets) {              						// DataTables向きのJsonデータリストを出力
			let pois = filter_geojson(targets), datas = []; 			// targetsに指定されたpoiのみフィルター
			pois.geojson.forEach((node) => {
				let tags = node.properties;
				let name = tags.name == undefined ? "-" : tags.name;
				let category = poiCont.get_catname(tags);
				datas.push({
					"osmid": node.id,
					"name": name,
					"category": category,
					"picture": tags.image !== undefined ? tags.image : "",
					"operator": tags.operator !== undefined ? tags.operator : "",
					"description": tags.description !== undefined ? tags.description : ""
				});
			});
			if (targets.indexOf(Conf.google.targetName) > 0) {			// targets内にgooglesheetがある場合
				adata.forEach((line) => {
					if (line !== undefined) {
						datas.push({
							"osmid": line.id,
							"name": line.title,
							"category": line.category,
							"picture": `<img class="list" src="${line.picture_url}">`,
							"operator": line.operator,
							"description": basic.convLinkTag(line.detail_url)
						});
					};
				});
			};
			datas.sort((a, b) => { return (a.between > b.between) ? 1 : -1 });
			return datas;
		}
	};
	function filter_geojson(targets) {
		let tars = [], enas = [], lls = [];
		let geojson = pdata.geojson.filter((geojson_val, geojson_idx) => {
			let found = false;
			for (let target_idx in pdata.targets[geojson_idx]) {
				if (targets.includes(pdata.targets[geojson_idx][target_idx])) {
					tars.push(pdata.targets[geojson_idx]);
					lls.push(latlngs[geojson_val.id]);
					enas.push(pdata.enable[geojson_idx]);
					found = true;
					break;
				};
			};
			return found;
		});
		return { geojson: geojson, latlng: lls, targets: tars, enable: enas };
	};
})();

var Marker = (function () {				// Marker closure
	var markers = {}, SvgIcon = {};		// SVGアイコン連想配列(filename,svg text)

	return {
		init: () => {
			Marker.set_size(Conf.style.Text.size, Conf.style.Text.view);
			let jqXHRs = [], keys = [];			// SVGファイルをSvgIconへ読み込む
			Object.keys(Conf.marker_tag).forEach(key1 => {
				Object.keys(Conf.marker_tag[key1]).forEach((key2) => {
					let filename = Conf.marker_tag[key1][key2];
					if (keys.indexOf(filename) == -1) {
						keys.push(filename);
						jqXHRs.push($.get(`./image/${filename}`));
					};
				});
			});
			$.when.apply($, jqXHRs).always(function () {
				let xs = new XMLSerializer();
				for (let key in keys) SvgIcon[keys[key]] = xs.serializeToString(arguments[key][0]);
			});
		},
		markers: () => {
			return markers;
		},
		images: () => {							// SvgIcon(svgを返す)
			return SvgIcon;
		},
		set: (target) => {						// Poi&Act表示
			console.log("Marker.set: " + target);
			Marker.delete(target);
			markers[target] = [];
			let all = poiCont.get_target(target);
			if (all.pois.geojson !== undefined) {		// pois表示
				all.pois.geojson.forEach(function (geojson, idx) {
					let poi = { "geojson": all.pois.geojson[idx], "targets": all.pois.targets[idx], "latlng": all.pois.latlng[idx], "enable": all.pois.enable[idx] };
					if (poi.enable) {
						make_marker({ target: target, poi: poi, langname: 'name' }).then(marker => {
							if (marker !== undefined) marker.forEach(val => markers[target].push(val));	// 複数Marker対応(Wikipediaの解説など)
						});
					};
				});
			};
			if (all.acts.length > 0) {					// acts表示
				for (let idx in all.acts) {
					make_marker({ target: target, act: all.acts[idx], filename: 'sakura.svg', langname: all.acts[idx].title }).then(marker => {
						if (marker !== undefined) marker.forEach(val => markers[target].push(val));
					});
				};
			};

		},
		get: (target, osmid) => {				// Poi取得
			let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
			let marker = markers[target][idx];
			return marker;
		},
		qr_add: (target, osmid, url, latlng, text) => {
			let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
			let qrcode = new QRCode({ content: url, join: true, container: "svg", width: 128, height: 128 });
			let data = qrcode.svg();
			let icon = L.divIcon({ "className": "icon", "iconSize": [512, 128], "html": `<div class="d-flex"><div class="flex-row">${data}</div><div class="p-2 bg-light"><span>${text}</span></div></div>` });
			let qr_marker = L.marker(new L.LatLng(latlng.lat, latlng.lng), { icon: icon, draggable: true });
			qr_marker.addTo(map);
			qr_marker.mapmaker_id = osmid + "-qr";
			qr_marker.mapmaker_key = target;
			qr_marker.mapmaker_svg = qrcode.svg;
			markers[target][idx] = [markers[target][idx], qr_marker];
			map.closePopup();
		},
		view: osmid => {
			_status = "view";
			listTable.select(osmid);
			let poi = poiCont.get_osmid(osmid);
			let tags = poi.geojson.properties;
			let date = moment(tags.timestamp);
			const osmidOrig = osmid;
			osmid = osmid.replace('/', "=");
			history.replaceState('', '', location.pathname + "?" + osmid + location.hash);

			$("#osmid").html(tags.id);
			$("#timestamp").html(date.format("YYYY/MM/DD hh:mm"));
			let name = tags.name == null ? "" : tags.name;
			if (tags.branch) {
				name += " " + tags.branch;
			}
			$("#name").html(name == null ? "-" : name);
			$("#category-icon").attr("src", tags.takeaway_icon);
			$("#category").html(poiCont.get_catname(tags));

			// opening_hours
			let openhour;
			if (tags["opening_hours:covid19"] != null) {
				openhour = tags["opening_hours:covid19"];
			} else {
				openhour = tags.opening_hours == null ? "-" : tags.opening_hours;
			};
			let RegexPTN = [[/\|\|/g, "<br>"], [/;/g, "<br>"]];
			Object.keys(Conf.opening_hours).forEach(key => {
				RegexPTN.push([new RegExp(key, "g"), Conf.opening_hours[key]]);
			});
			RegexPTN.forEach(val => { openhour = openhour.replace(val[0], val[1]) });
			if (tags["opening_hours:covid19"] != null) { openhour += Conf.category.suffix_covid19 }
			$("#opening_hours").html(openhour);

			// cuisine
			let cuisine = [];
			if (tags.cuisine != null) {
				cuisine = tags.cuisine.split(";").map(key => {
					return Conf.category.cuisine[key] || key;
				});
			};

			// cuisine(diet)
			let diet = Object.keys(Conf.category.diet).map(key => {
				if (tags[key] != null) {
					if (tags[key] !== "no") return Conf.category.diet[key] || key;
				}
			});
			cuisine = cuisine.concat(diet);
			cuisine = cuisine.filter(Boolean);
			cuisine = cuisine.join(', ');
			$("#cuisine").html(cuisine == "" ? "-" : cuisine);

			if (Conf.local.EnableBookmark == true) {
				let bookmarked = bookmark.isBookmarked(osmidOrig);
				const CLASS_BOOKMARK_TRUE = "btn-bookmark-true";
				const CLASS_BOOKMARK_FALSE = "btn-bookmark-false";
				$("#modal_bookmark").show();
				$("#modal_bookmark").removeClass((bookmarked) ? CLASS_BOOKMARK_FALSE : CLASS_BOOKMARK_TRUE);
				$("#modal_bookmark").addClass((!bookmarked) ? CLASS_BOOKMARK_FALSE : CLASS_BOOKMARK_TRUE);
				$('#modal_bookmark').unbind('click');
				$('#modal_bookmark').click(() => {
					console.log(name);
					bookmarked = !bookmarked;
					bookmark.setBookmarkByModal(osmidOrig, bookmarked);
					$("#modal_bookmark").removeClass((bookmarked) ? CLASS_BOOKMARK_FALSE : CLASS_BOOKMARK_TRUE);
					$("#modal_bookmark").addClass((!bookmarked) ? CLASS_BOOKMARK_FALSE : CLASS_BOOKMARK_TRUE);
				});
			}

			let outseet = YESNO.indexOf(tags.outdoor_seating) < 0 ? "" : tags.outdoor_seating;
			if (outseet !== "") {
				$("#outdoor_seating").attr("glot-model", "outdoor_seating_" + outseet);
			} else {
				$("#outdoor_seating").removeAttr("glot-model");
			};

			// takeout
			let takeaway;
			if (tags["takeaway:covid19"] != null) {
				takeaway = Conf.category.takeaway[tags["takeaway:covid19"]];
				takeaway = takeaway == undefined ? "?" : takeaway + Conf.category.suffix_covid19;
			} else {
				takeaway = tags.takeaway == null ? "-" : Conf.category.takeaway[tags.takeaway];
				takeaway = takeaway == undefined ? "?" : takeaway;
			};
			$("#takeaway").html(takeaway);

			// delivery
			let delname;
			if (tags["delivery:covid19"] != null) {
				delname = Conf.category.delivery[tags["delivery:covid19"]];
				delname = delname == undefined ? "?" : delname + Conf.category.suffix_covid19;
			} else {
				delname = tags.delivery == null ? "-" : Conf.category.delivery[tags.delivery];
				delname = delname == undefined ? "?" : delname;
			}
			$("#delivery").html(delname);

			if (tags.phone != null) {
				$("#phone").html("<a href=\"" + ("tel:" + tags.phone) + "\">" + tags.phone + "</a>");
			} else {
				$("#phone").html("-");
			};

			let fld = {};
			fld.website = tags["contact:website"] == null ? tags["website"] : tags["contact:website"];
			fld.sns_instagram = tags["contact:instagram"] == null ? tags["instagram"] : tags["contact:instagram"];
			fld.sns_twitter = tags["contact:twitter"] == null ? tags["twitter"] : tags["contact:twitter"];
			fld.sns_facebook = tags["contact:facebook"] == null ? tags["facebook"] : tags["contact:facebook"];
			Object.keys(fld).forEach(key => {
				if (fld[key] == null) {
					$("#" + key).hide();
				} else {
					$("#" + key).show();
				};
			});

			$("#description").html(tags.description == null ? "-" : tags.description.trim());

			glot.render();
			$('#PoiView_Modal').modal({ backdrop: 'static', keyboard: true });

			let hidden = e => {
				_status = "";
				history.replaceState('', '', location.pathname + location.hash);
				$('#PoiView_Modal').modal('hide');
			};
			$('#PoiView_Modal').one('hidePrevented.bs.modal', hidden);
			$('#PoiView_Modal').one('hidden.bs.modal', hidden);
		},

		center: (poiid) => {								// Map move to PoiId & Zoom(config)
			// Conf.style.Circle.radius = Math.pow(2, 21 - map.getZoom());			
			let circle, poi = poiCont.get_osmid(poiid);
			let zoomlv = Conf.default.iconViewZoom >= map.getZoom() ? Conf.default.iconViewZoom : map.getZoom();
			if (poi !== undefined) {
				map.flyTo(poi.latlng, zoomlv, { animate: true, easeLinearity: 0.1, duration: 0.5 });
				if (poi.latlng.lat.length == undefined) {		// latlngが複数ある場合はcircleなし
					circle = L.circle(poi.latlng, Conf.style.Circle).addTo(map);
					setTimeout(() => map.removeLayer(circle), Conf.style.Circle.timer);
				};
			} else {
				poi = poiCont.get_actid(poiid);
				let latlng = { lat: poi.lat, lng: poi.lng };
				map.flyTo(latlng, zoomlv, { animate: true, easeLinearity: 0.1, duration: 0.5 });
				circle = L.circle(latlng, Conf.style.Circle).addTo(map);
				setTimeout(() => map.removeLayer(circle), Conf.style.Circle.timer);
				console.log("event")
			}
		},

		set_size: (size, view) => {
			let icon_xy = Math.ceil(size * Conf.style.Icon.scale);
			Conf.effect.text.size = size;		// set font size 
			Conf.effect.text.view = view;
			Conf.effect.icon.x = icon_xy;		// set icon size
			Conf.effect.icon.y = icon_xy;
		},

		all_clear: () => Object.keys(markers).forEach((target) => Marker.delete(target)),	// all delete

		delete: (target, osmid) => {														// Marker delete * don't set pdata
			if (osmid == undefined || osmid == "") {	// all osmid
				if (markers[target] !== undefined) {
					markers[target].forEach(marker => delmaker(marker));
					markers[target] = [];
				};
			} else {									// delete osmid
				let idx = markers[target].findIndex(vals => {
					let val = vals.length == undefined ? vals : vals[0];
					return val.mapmaker_id == osmid;
				});
				delmaker(markers[target][idx]);
			};
			map.closePopup();

			function delmaker(marker) {	// 実際にマーカーを消す処理
				if (marker == undefined) return;
				if (marker.length == undefined) { map.removeLayer(marker); return };
				marker.forEach(m => map.removeLayer(m));								// qr_code で markerが複数ある場合
			};
		}
	};

	function make_marker(params) {	// markerは複数返す時がある
		return new Promise((resolve, reject) => {
			let categorys = Object.keys(Conf.category), icon_name, name;
			if (params.target == Conf.google.targetName) {		// set Activity Marker
				icon_name = params.filename;
				name = params.langname;
				let html = `<div class="d-flex"><img style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" src="./image/${icon_name}" icon-name="${name}">`;
				let span = `<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
				if (name !== "" && Conf.effect.text.view) html += span;
				let span_width = name !== "" ? name.length * Conf.effect.text.size : 0;
				let icon = L.divIcon({ "className": "", "iconSize": [Conf.effect.icon.x + span_width, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
				let marker = L.marker(new L.LatLng(params.act.lat, params.act.lng), { icon: icon, draggable: false });
				marker.addTo(map).on('click', e => {  cmap_events.detail_view(e) });
				marker.mapmaker_id = params.act.id;
				marker.mapmaker_key = params.target;
				marker.mapmaker_lang = params.langname;
				marker.mapmaker_icon = icon_name;
				resolve([marker]);
			} else {
				let tags = params.poi.geojson.properties.tags == undefined ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
				name = tags[params.langname] == undefined ? tags.name : tags[params.langname];
				name = (name == "" || name == undefined) ? "" : name;
				switch (params.target) {
					case "wikipedia":
						icon_name = params.filename == undefined ? Conf.osm.wikipedia.marker : params.filename;
						try {
							name = tags[Conf.osm.wikipedia.tag].split(':')[1];
						} catch {
							console.log(tags[Conf.osm.wikipedia.tag]);
						};
						let html = `<div class="d-flex"><img style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" src="./image/${icon_name}" icon-name="${name}">`;
						if (name !== "" && Conf.effect.text.view) html = `${html}<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
						let icon = L.divIcon({ "className": "", "iconSize": [200 * Conf.style.Icon.scale, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
						let marker = L.marker(new L.LatLng(params.poi.latlng.lat, params.poi.latlng.lng), { icon: icon, draggable: false });
						marker.addTo(map).on('click', e => {  cmap_events.detail_view(e) });
						marker.mapmaker_id = params.poi.geojson.id;
						marker.mapmaker_key = params.target;
						marker.mapmaker_lang = tags[Conf.osm.wikipedia.tag];
						marker.mapmaker_icon = icon_name;
						resolve([marker]);
						break;
					default:
						let keyn = categorys.find(key => tags[key] !== undefined);
						let keyv = (keyn !== undefined) ? Conf.marker_tag[keyn][tags[keyn]] : undefined;
						if (keyn !== undefined && keyv !== undefined) {	// in category
							icon_name = params.filename == undefined ? Conf.marker_tag[keyn][tags[keyn]] : params.filename;
							let html = `<div class="d-flex"><img style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" src="./image/${icon_name}" icon-name="${name}">`;
							let span = `<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
							if (name !== "" && Conf.effect.text.view) html += span;
							let span_width = name !== "" ? name.length * Conf.effect.text.size : 0;
							let icon = L.divIcon({ "className": "", "iconSize": [Conf.effect.icon.x + span_width, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
							let marker = L.marker(new L.LatLng(params.poi.latlng.lat, params.poi.latlng.lng), { icon: icon, draggable: false });
							marker.addTo(map).on('click', e => {  cmap_events.detail_view(e) });
							marker.mapmaker_id = params.poi.geojson.id;
							marker.mapmaker_key = params.target;
							marker.mapmaker_lang = params.langname;
							marker.mapmaker_icon = icon_name;
							resolve([marker]);
						};
						break;
				};
			};
		});
	};
})();

// listTable管理(イベントやPoi情報を表示)
class ListTable {

	constructor() {
		this.table;
		this.lock = false;
		this.timeout = 0;
	};

	init() { // dataListに必要な初期化
		function keyword_change() {        				// キーワード検索
			if (this.timeout > 0) {
				window.clearTimeout(this.timeout);
				this.timeout = 0;
			};
			this.timeout = window.setTimeout(() => listTable.filter(keyword.value, 500));
		};
		keyword.removeEventListener('change', keyword_change);
		keyword.addEventListener('change', keyword_change);

		function category_change() {        			// カテゴリ名でキーワード検索
			let category = category_list.value;
			listTable.filter(category == "-" ? "" : category);
		};
		keyword.removeEventListener('change', category_change);
		keyword.addEventListener('change', category_change);
	};

	category_make(result) {    							// Poi種別リストを作成
		WinCont.select_clear(`category_list`);
		let pois = result.map(data => { return data.category });
		pois = pois.filter((x, i, self) => { return self.indexOf(x) === i });
		pois.map(poi => WinCont.select_add(`category_list`, poi, poi));
	};

	datalist_make(targets) {  							// リスト表示
		this.lock = true;
		if (this.table !== undefined) this.table.destroy();
		let result = poiCont.list(targets);
		let columns = targets == Conf.google.sheetName ? Conf.datatables_columns_googlesheet : Conf.datatables_columns_osm;
		this.table = $('#tableid').DataTable({
			"columns": Object.keys(columns).map(function (key) { return columns[key] }),
			"data": result,
			"processing": true,
			"filter": true,
			"destroy": true,
			"deferRender": true,
			"dom": 't',
			"language": Conf.datatables_lang,
			"order": [],    // ソート禁止(行選択時にズレが生じる)
			"ordering": true,
			"orderClasses": false,
			"paging": true,
			"processing": false,
			"pageLength": 100000,
			"select": 'single',
			"scrollY": window.innerHeight * 0.4,
			"scrollCollapse": true
		});
		$('#modal_select_table').css("width", "");
		listTable.category_make(result);
		// let osmids = result.filter(val => val.enable).map(val => val.osmid);
		this.one_select([]);
		this.table.draw();
		this.table.off('select');
		this.table.on('select', (e, dt, type, indexes) => {
			e.stopPropagation();
			if (type === 'row') {
				var data = this.table.rows(indexes).data().pluck('osmid');
				Marker.center(data[0]);
			}
		});
		this.lock = false;
	};

	one_select(osmids) {
		let alldata = this.table.rows().data().toArray();
		let join_ids = osmids.join('|');
		alldata.forEach((val, idx) => { if (join_ids.indexOf(val.osmid) > -1) this.table.row(idx).select() });
	};

	indexes() { // アイコンをクリックした時にデータを選択
		let selects = this.table.rows('.selected').indexes();
		selects = table.rows(selects).data();
		return selects.toArray();
	};

	filter(keyword) {
		console.log("ListTable: filter keyword: " + keyword);
		this.table.search(keyword).draw();
	};                		// キーワード検索
	filtered() { this.table.rows({ filter: 'applied' }).data().toArray() }; 		// 現在の検索結果リスト
	filtered_select() { this.table.rows({ filter: 'applied' }).select() };
	filtered_deselect() { this.table.rows({ filter: 'applied' }).deselect() };
};
var listTable = new ListTable();
