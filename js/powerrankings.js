// Application Loading Flow
// 1. DOMContentLoaded Event
// 2. Bind Listeners for user input
// 3. load_saved_session() [localStorage lookup]
// 4. fetch_resources() -> fetch_tiers_and_teams() [web fetch()]
// 5. set_application_state() -> show_setup_form() | show_pr_form()
//
// Event handle_setup_form() [<form submit>]
// 1. save_pr_data() - save current PR object to localStorage
// 2. set_application_state() - show_setup_form() |  show_pr_form()
//
// Event handle_pr_form() [<form submit>]
// 1. (nothing)
//
// Event handle_week_select() [<select change>]
// 1. load_pr_form_data() - clear and generate DOM form elements
//
// Event handle_tier_select() [<select change>]
// 1. Add TIERS to PR.working if it is empty
// 2. Set PR.current_tier to selected tier
// 3. load_pr_form_data()
//
// Event handle_pr_form_changes() [<select change>]
// 1. Grab current value / rank of team.
// 2. Store in PR.working[ $TIER ][ $RANK ] = $TEAMNAME;
// 3. save_pr_data()
// 4. render() [TODO]
//

/*
 * // working is the "week"
 * working: {
 * 		"Premier": [ null, "Anglers", "Whatevers", "Somethings" ],
 * 		"Master": [ null, "Anglers", "Whatevers", "Somethings" ],
 * },
 * data: {
 * 		17: { 1: {}, 2: {}, ... 16: {} }
 * 		18: { 1: {}, 2: {}, } (last element is "working")
 * }
 *
 */
const PR = {
	season: null,
	current_week: 1,
	current_tier: null,
	working: {},
	data: {},
};

// storage element for our current tiers (pulled from API)
let DATA_READY = false;
const TIERS    = [];
const TEAMS    = {};
const TEAM_MAP = {};
const LOGOS    = {}; // object pool for our images

// single object to store our rendered image in
let RENDERED = null;

// tier colors
const COLORS = {
	'Premier': '#d600d6',
	'Master': '#9b59b6',
	'Elite': '#3498db',
	'Veteran': '#33ffda',
	'Rival': '#2ecc71',
	'Challenger': '#ceb337',
	'Prospect': '#e67e22',
	'Contender': '#d64694',
	'Amateur': '#f3a9a9',
};

// main program entry point. DOMContentLoaded
// attaches event handlers, then kicks off with 
// load_saved_session();
document.addEventListener('DOMContentLoaded', async () => {
	document.getElementById('setup_form').addEventListener('submit', handle_setup_form);
	document.getElementById('pr_form').addEventListener('submit', handle_pr_form);
	document.getElementById('week').addEventListener('change', handle_week_select);
	document.getElementById('tier').addEventListener('change', handle_tier_select);
	document.getElementById('pr_form').addEventListener('change', handle_pr_form_changes);
	document.getElementById('download_image').addEventListener('click', download_image);
	document.getElementById('change_season').addEventListener('click', change_season);
	document.getElementById('clear_storage').addEventListener('click', clear_storage);

	// set up the application once DOM is loaded
	await fetch_resources();
	load_saved_session();
	set_application_state();
	update_storage();
});

function download_image() {
	const canvas = document.getElementById('powerrankings');
	image = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
	const link = document.createElement('a');
	const imageName = `${document.getElementById('tier').value}-${document.getElementById('week').value}.png`;
	link.download = imageName;
	link.href = image;
	link.click();
}

function change_season() {
	save_pr_data();

	PR.season = null;
	PR.current_tier = null;
	PR.current_week = null;
	PR.working = {};
	PR.data = {};

	set_application_state();
}

// pulls saved state out of localstorage
function load_saved_session() {
	const saved_pr = JSON.parse(localStorage.getItem('rsc_powerrankings'));
	if ( saved_pr ) {
		PR.season = saved_pr.season;
		PR.working = saved_pr.working;
		PR.data = saved_pr.data;
		PR.current_week = saved_pr.current_week;
		PR.current_tier = saved_pr.current_tier;
	}

	////console.log('loading season data from storage', saved_pr);
}

// decides what form elements to show, presets
// any stored fields, populates inputs, etc
function set_application_state() {
	if ( PR.season === null || PR.season === undefined ) {
		show_setup_form()
	} else {
		show_pr_form();
	}

	if ( PR.current_tier !== null || PR.current_tier !== undefined ) {
		// TODO(erh): Loading spinner...

		if ( DATA_READY ) { // data is here, we can safely load
			return load_pr_form_data(); 
		}
		return setTimeout(function() { load_pr_form_data(1) }, 200 );
	}
}

function show_setup_form() {
	//console.log('Loading setup form');
	document.getElementById('setup_form_panel').classList.remove('d-none');
	document.getElementById('pr_form_panel').classList.add('d-none');
}

function show_pr_form() {
	//console.log('Loading PR form');
	document.getElementById('setup_form_panel').classList.add('d-none');
	document.getElementById('pr_form_panel').classList.remove('d-none');

	const weeks = document.getElementById('week').options;
	for ( let i = 0; i < weeks.length; ++i ) {
		const week_val = parseInt(weeks[i].value);
		if ( week_val === PR.current_week ) {
			document.getElementById('week').selectedIndex = i;
			break;
		}
	}
}

function save_pr_data() {
	localStorage.setItem('rsc_powerrankings', JSON.stringify(PR));

	update_storage();

	return true;
}

function clear_storage() {
	if ( confirm('Are you sure you want to clear your storage? You will lose all historical data.') ) {
		localStorage.clear();
		return window.location.reload();
	}
}

function update_storage() {
	let storageTotal = 0, xLen, x;
	for (x in localStorage) {
		if ( ! localStorage.hasOwnProperty(x) ) {
			continue;
		}
		xLen = ((localStorage[x].length + x.length) * 2) / (1024 * 1024);
		storageTotal += xLen;
	}

	if ( storageTotal > 9 ) {
		alert('You have a ton of historical data stored and are almost out of space. Message blister for help.');
	}

	const percentage = (storageTotal / 10).toFixed(2);
	storageTotal = storageTotal.toFixed(2);
	document.getElementById('storage_used').innerText = `${storageTotal} MB`;
	document.getElementById('storage_remaining').innerText = `${percentage}%`;
}

function get_max_teams() {
	return DATA_READY && PR.current_tier ? 
		Math.min(Math.max(TEAMS[PR.current_tier].length, 8), 16) : 0;
}

function load_pr_form_data(attempts = 1) {
	// prevent possible race condition where we're trying to draw
	// the form before our data is available from the API.
	if ( ! DATA_READY ) {
		if ( attempts < 10 ) {
			//console.log('decaying...', attempts);
			const decay = attempts * 50;
			return setTimeout(() => { load_pr_form_data(attempts + 1) }, decay);
		} else {
			// TODO(erh): notify user that there was an error.
			// try again, then ping me
			//console.log('dead...', attempts);
			return console.error('API error. Contact tehblister.');
		}
	} else if ( PR.current_tier && ! (PR.current_tier in TEAMS) ) {
		console.info("Huh?");
		console.info(PR.current_tier, TEAMS);
		return setTimeout(() => { load_pr_form_data(attempts + 1); }, 200);
	}

	if ( ! PR.season ) {
		return;
	}

	if ( ! PR.current_tier ) {
		return;
	}

	const team_form = document.getElementById('teamDropdowns');
	team_form.innerHTML = '';

	const max_teams = get_max_teams();

	let team_options = '<option disabled selected>Select a team</option>';
	const team_index_map = {};
	//console.log(PR, PR.current_tier, DATA_READY, TEAMS);
	//console.log("TEAMS", TEAMS);
	for ( let i = 0; i < TEAMS[ PR.current_tier ].length; ++i ) {
		const team = TEAMS[ PR.current_tier ][i];
		team_options += `
		<option value="${team.teamName}">${team.teamName}</option>
		`;
		team_index_map[ team.teamName ] = i + 1;
	}

	// calculate the deltas to put in the form
	let prev_week = {};
	const last_rank = {};
	if ( PR.current_week > 1 ) {
		const prev_week_num = PR.current_week - 1;
		if ( PR.season in PR.data && prev_week_num in PR.data[PR.season] && PR.current_tier in PR.data[PR.season][prev_week_num] ) {
			prev_week = PR.data[ PR.season ][ prev_week_num ][ PR.current_tier ];

			for ( const rank in prev_week ) {
				last_rank[ prev_week[rank] ] = rank;
			}
 		}
	}
	//console.log('rendering the form', TEAMS[PR.current_tier].length, max_teams);
	for ( let i = 1; i <= max_teams; ++i ) {
		const team_id = `rank${i}`;
		const div_el = document.createElement('div');
		div_el.classList.add('mb-3');
		div_el.innerHTML = `
		<div class="row">
			<div class="col-10">
				<label for="${team_id}" class="form-label">Rank ${i} Team</label>
				<select data-rank="${i}" name="${team_id}" id="${team_id}" class="team-select form-select form-select-lg">
					${team_options}
				</select>
			</div>
			<div class="col-2">
				<label for="${team_id}_delta" class="form-label">Rank ${i} Δ</label>
				<input type="number" name="${team_id}_delta" id="${team_id}_delta" class="team-delta form-control form-control-lg" value="" min="-16" max="16">
			</div>
		</div>
		`;
		team_form.appendChild(div_el);
		//console.log('working', i, PR.working[PR.current_tier], team_index_map);
		if ( PR.current_tier in PR.working && i in PR.working[ PR.current_tier ] ) {
 			const curr_team = PR.working[ PR.current_tier ][i];
			document.getElementById(team_id).selectedIndex = team_index_map[ 
				PR.working[ PR.current_tier ][ i ]
			];
			if ( curr_team && curr_team in last_rank ) {
				const last_rank_score = parseInt(last_rank[curr_team]);
				const delta_score = last_rank_score - i;
				document.getElementById(`${team_id}_delta`).value = delta_score;
			}
		}


	}


	set_pr_form_errors();

	// start an initial render
	render();
}

async function load_tiers_and_teams() {
	if ( TIERS.length === 0 ) {
		// const response_json = await fetch('https://devleague.rscna.com/tiers');
		// const data = await response_json.json();
		// https://api.rscna.com/api/v1/tiers/?league=1
		const data = await fetch('https://api.rscna.com/api/v1/tiers/?format=json&league=1').then(res => res.json());
		//const data = await fetch('https://api.rscna.com/api/v1/franchises/?format=json&league=1').then(res => res.json());
		// const data = await response_json.json();
		console.log('fetch complete!');
		console.log(data);

		if (data) {
			for ( let i = 0; i < data.length; ++i ) {
				TIERS.push(data[i].name);
			}
		}
			// .then(res => res.json())
			// .then(data => {
			// 	for ( let i = 0; i < data.length; ++i ) {
			// 		TIERS.push(data[i].name);
			// 	}
			// 	
			// 	//console.log('loading teams now');
			// 	return load_tiers_and_teams();
			// });
	}

	//console.log('loading teams');

	const tier_select = document.getElementById('tier');
	let selected_tier_idx = 0;
	if ( tier_select.options.length === 1 && TIERS.length ) {
		for ( let i = 0; i < TIERS.length; ++i ) {
			const el = document.createElement('option');
			el.value = TIERS[i];
			el.innerText = TIERS[i];
			if ( TIERS[i] === PR.current_tier ) {
				selected_tier_idx = i + 1;
			}
			tier_select.appendChild(el);
		}
	}

	tier_select.selectedIndex = selected_tier_idx;

	if ( TIERS.length > 0 && Object.keys(TEAMS).length === 0 ) {
		for ( let i = 0; i < TIERS.length; ++i ) {
			fetch(`https://devleague.rscna.com/teams/${TIERS[i]}`)
				.then(res => res.json())
				.then(data => {
					TEAMS[ TIERS[i] ] = data;
					for ( let i = 0; i < data.length; ++i ) {
						if ( ! (data[i].franchise in LOGOS) ) {
							const fran = data[i].franchise.replaceAll(' ', '-');
							LOGOS[ fran ] = new Image();
							LOGOS[ fran ].src = `https://devleague.rscna.com/logo/${fran}.png`;
						}
						TEAM_MAP[`${data[i].tier}_${data[i].teamName}`] = data[i];
					}
					//console.log('setting data ready');
					return DATA_READY = true;
				});
		}
	}
}

async function fetch_resources() {
	await load_tiers_and_teams();	
}

function render() {
	//console.log('rendering');

	RENDERED = new Image();
	RENDERED.src = 'img/background-transparent.png';
	RENDERED.addEventListener('load', render_image, false);
}

function render_image() {
	//console.log('Beginning render...');
	const pr_canvas = document.getElementById('powerrankings');
	//const _instructionEl = document.querySelector('div.alert.empty');
	//const _downloadEl = document.querySelector('div.alert.ready');
	const ctx = pr_canvas.getContext('2d');
	pr_canvas.width  = 1080;
	pr_canvas.height = 1350;
	
	if ( ! PR.current_tier ) {
		return;
	}
	
	ctx.fillStyle = COLORS[PR.current_tier];
	ctx.fillRect(0,0, pr_canvas.width, pr_canvas.height);

	ctx.drawImage(RENDERED, 0, 0);

	// starting coordinates
	let move_x = 115 - 60;
	let logo_x = 115; // 620
	let text_x = 226; // 729
	let score_x = 450; // 729

	const s_logo_y = 346;
	const s_team_y = 380;

	let prev_week = {};
	const last_rank = {};
	if ( PR.current_week > 1 ) {
		const prev_week_num = PR.current_week - 1;
		if ( PR.season in PR.data && prev_week_num in PR.data[PR.season] && PR.current_tier in PR.data[PR.season][prev_week_num] ) {
			prev_week = PR.data[ PR.season ][ prev_week_num ][ PR.current_tier ];

			for ( const rank in prev_week ) {
				last_rank[ prev_week[rank] ] = rank;
			}
 		}
	}
	for ( const rank in PR.working[ PR.current_tier ] ) {
		//console.log( `${PR.current_tier}_${PR.working[ PR.current_tier ][ rank ]}`, rank);
		const team = TEAM_MAP[`${PR.current_tier}_${PR.working[ PR.current_tier ][ rank ]}`];
		const t_name = team.teamName;
		const fran_url = team.franchise.replaceAll(' ', '-');

		// calculate our delta and color
		let draw_delta  = 0;
		let delta_color = '#1cc117';
		let delta_arrow = parseInt(2191, 16);
		if ( PR.current_week > 1 ) {
			const delta_el = document.getElementById(`rank${rank}_delta`);
			if ( delta_el && delta_el.value ) {
				draw_delta = parseInt(delta_el.value);
			} else if ( t_name in last_rank ) {
				draw_delta = last_rank[ t_name ] - rank;
			}
		
			if ( draw_delta < 0 ) {
				draw_delta = draw_delta * -1; // normalize negatives
				delta_color = '#d81c00';
				delta_arrow = parseInt(2193, 16);
			}
		}

		// reset for second column
		// TODO(erh): see if we can drop this column if we have < 9
		let pos_mod = rank - 1;
		if ( rank > 8 ) {
			move_x = 620 - 60;
			logo_x = 620;
			text_x = 729;
			pos_mod = pos_mod - 8;
			score_x = 953;
		}

		const logo_y = s_logo_y + (pos_mod * 125);
		const team_y = s_team_y + (pos_mod * 125);
		const fran_y = team_y + 25;

		ctx.drawImage(LOGOS[fran_url], logo_x, logo_y, 75, 75);

		// team
		ctx.fillStyle = '#000000';
		ctx.font = 'bold 24px Poppins';
		ctx.fillText(t_name.toUpperCase(), text_x, team_y);

		// franchise
		ctx.font = '17px Poppins';
		ctx.fillText(team.franchise.toUpperCase(), text_x, fran_y);
	
		// scores
		ctx.font = '20px Poppins';
		if ( parseFloat(team.winPct) > 50 ) {
			ctx.fillStyle = '#036602';
		} else {
			ctx.fillStyle = '#d81c00';
		}
		ctx.fillText(`${team.wins} / ${team.loss}`, score_x, fran_y + 10);

		ctx.font = 'bold 24px Poppins';
		ctx.fillStyle = delta_color;
		if ( draw_delta !== 0 ) {
			ctx.fillText(String.fromCharCode(delta_arrow) + draw_delta, move_x, logo_y + 10);
		}
	}

	ctx.fillStyle = COLORS[ PR.current_tier ];
	ctx.fillRect(95, 75, 340, 60);
	ctx.beginPath();
	ctx.arc(95, 105, 30, 0, 2 * Math.PI);
	ctx.arc(435, 105, 30, 0, 2 * Math.PI);
	ctx.fillStyle = COLORS[ PR.current_tier ];
	ctx.fill();

	ctx.font = 'bold 42px Poppins';
	ctx.fillStyle = PR.current_tier === 'Master' ? '#FFFFFF' : '#000000';
	ctx.textAlign = 'center';
	ctx.fillText(PR.current_tier.toUpperCase(), 265, 120);
	ctx.font = '42px Poppins';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'left';
	// Season ##, Week #
	ctx.fillText(`SEASON ${PR.season}, WEEK ${PR.current_week}`, 65, 260);
}


/* EVENT HANDLERS */
function handle_setup_form(ev) {
	ev.preventDefault();
	const season_el = document.getElementById('season');
	const season = parseInt(season_el.value.trim());
	//console.log('Season is', season);
	if ( season && season >= 17 && season < 50 ) {
		PR.season = season;
		save_pr_data();
		set_application_state();
	}
}

function handle_pr_form(ev) {
	ev.preventDefault();
	render();
}

function set_pr_form_errors() {
	const team_ranks = document.querySelectorAll('.team-select');
	for ( let i = 0; i < team_ranks.length; ++i ) {
		const used = Object.values(PR.working[PR.current_tier]).filter(e => team_ranks[i].value === e).length;
		if ( used > 1 ) {
			team_ranks[i].classList.add('bg-danger');
		} else {
			team_ranks[i].classList.remove('bg-danger');
		}
	}
}

function handle_pr_form_changes(ev) {
	const target = ev.target;
	if ( target.classList.contains('team-select') ) {
		const rank = parseInt(target.dataset.rank);

		PR.working[ PR.current_tier ][ rank ] = target.value;

		const used = Object.values(PR.working[PR.current_tier]).filter(e => target.value === e).length;
		console.log(Object.values(PR.working[PR.current_tier]),target.value, used);

		set_pr_form_errors();
	} else if ( target.classList.contains('team-delta') ) {
	}

	save_pr_data();
	return render();
}

// select/store week
function handle_week_select(ev) {
	console.log('New Week', ev.currentTarget.value);
	const new_week = parseInt(ev.currentTarget.value);
	if ( new_week !== PR.current_week ) {
		const cur_week = PR.current_week;
	
		if ( ! ( PR.season in PR.data ) ) {
			PR.data[ PR.season ] = {};
		}
		// if we don't clone the object, it will be used as a reference
		// and break everything
		PR.data[ PR.season ][ cur_week ] = { ...PR.working };

		if ( new_week in PR.data[ PR.season ] ) {
			PR.working = { ...PR.data[ PR.season ][ new_week ] };
			console.log('exists');
			console.log(PR.working[PR.current_tier]);
		} else {
			console.log('use previous week', PR.data[PR.season][cur_week]);
			let prev_week = null;
			if ( new_week > 1 ) {
				prev_week = new_week - 1;
			}
			if ( prev_week in PR.data[PR.season] ) {
				PR.working = { ...PR.data[PR.season][prev_week] };
			} else if ( cur_week in PR.data[PR.season] ) {
				PR.working = { ...PR.data[PR.season][cur_week] };
			} else {
				PR.working = {};
			}
			// default to the previous week
		}

		PR.current_week = new_week;

		//PR.current_tier = null;
		//document.getElementById('tier').selectedIndex = 0;

		save_pr_data();
		load_pr_form_data();
	}
}

function handle_tier_select(ev) {
	if ( Object.keys(PR.working).length === 0 ) {
		for ( let i = 0; i < TIERS.length; ++i ) {
			PR.working[ TIERS[i] ] = {};
		}
	}

	const new_tier = ev.currentTarget.value;
	if ( PR.current_tier !== new_tier ) {
		PR.current_tier = new_tier;
	}

	load_pr_form_data();
}

