import type { LevelDef, CityId, MechanicId, TimeOfDay } from '../core/types';

// 30-level world tour. Difficulty ramps via density, traffic speed, speedMul, curves and heavy traffic;
// each city gets mechanics that fit its character (see docs/AGENT_GUIDE.md).
type Row = [number, CityId, string, string, 3 | 5, number, TimeOfDay, number, number, number, MechanicId[], number, number, number, string, string];

const ROWS: Row[] = [
  // id, city, name de, name en, lanes, length, tod, density, trafficSpeed, speedMul, mechanics, curves, heavy, reward, desc de, desc en
  [1, 'tokyo', 'Shuto-Schnellstraße', 'Shuto Expressway', 3, 1800, 'dusk', 0.35, 0.55, 1.0, ['blossom'], 0.15, 0.05, 200, 'Willkommen in Tokio. Wische, um die Spur zu wechseln.', 'Welcome to Tokyo. Swipe to change lanes.'],
  [2, 'osaka', 'Hanshin-Autobahn', 'Hanshin Expressway', 3, 2000, 'night', 0.4, 0.55, 1.0, ['festival', 'fireworks'], 0.2, 0.08, 250, 'Feuerwerk über Dotonbori, Laternen über der Straße.', 'Fireworks over Dotonbori, lanterns over the road.'],
  [3, 'duesseldorf', 'Rheinkniebrücke', 'Rheinkniebrücke', 3, 2200, 'day', 0.42, 0.58, 1.02, ['rain', 'trains', 'construction'], 0.2, 0.1, 300, 'Regen am Rhein, Rheinbahn-Kreuzungen und ewige Baustellen.', 'Rain on the Rhine, tram crossings and eternal roadworks.'],
  [4, 'kyoto', 'Higashiyama-Pass', 'Higashiyama Pass', 3, 2400, 'dawn', 0.42, 0.58, 1.04, ['blossom', 'curves', 'hills'], 0.55, 0.08, 320, 'Kurven durch Kirschblüten und Tempelhügel.', 'Curves through cherry blossoms and temple hills.'],
  [5, 'istanbul', 'Bosporus-Brücke', 'Bosphorus Bridge', 3, 2500, 'dusk', 0.45, 0.6, 1.05, ['oncoming', 'bridge', 'traffic_jam'], 0.25, 0.12, 350, 'Dolmuş-Geisterfahrer und Stau auf der Brücke zwischen zwei Kontinenten.', 'Wrong-way dolmuş and jams on the bridge between two continents.'],
  [6, 'berlin', 'Stadtring A100', 'A100 City Ring', 3, 2600, 'night', 0.48, 0.6, 1.06, ['night', 'neon', 'police'], 0.25, 0.12, 380, 'Nachtfahrt mit Blaulicht im Rückspiegel.', 'Night run with blue lights in the mirror.'],
  [7, 'paris', 'Périphérique', 'Périphérique', 3, 2700, 'dawn', 0.5, 0.62, 1.08, ['fog', 'speed_cameras', 'curves'], 0.4, 0.14, 400, 'Nebel über der Seine, Blitzer an jeder Ecke.', 'Fog over the Seine, speed cameras everywhere.'],
  [8, 'london', 'Tower Bridge Road', 'Tower Bridge Road', 3, 2800, 'day', 0.5, 0.62, 1.08, ['rain', 'toll', 'drawbridge'], 0.3, 0.16, 420, 'Mautstellen, Regen und eine Brücke, die hochgeht.', 'Toll gates, rain and a bridge that opens.'],
  [9, 'nagoya', 'Meishin-Autobahn', 'Meishin Expressway', 3, 3000, 'dusk', 0.52, 0.64, 1.1, ['convoy', 'nitro_pads', 'tunnels'], 0.3, 0.2, 450, 'Lkw-Konvois, Tunnel und Nitro-Pads.', 'Truck convoys, tunnels and nitro pads.'],
  [10, 'munich', 'Mittlerer Ring', 'Mittlerer Ring', 5, 3000, 'day', 0.5, 0.62, 1.1, ['boss_truck', 'festival', 'hills'], 0.3, 0.2, 600, 'Fünf Spuren! Und ein Bierlaster-Boss zur Wiesn.', 'Five lanes! And a beer-truck boss for Oktoberfest.'],
  [11, 'amsterdam', 'Ring A10', 'Ring A10', 5, 3100, 'dusk', 0.52, 0.64, 1.1, ['drawbridge', 'wind', 'flood'], 0.2, 0.16, 500, 'Grachtenbrücken, Seitenwind und Hochwasser.', 'Canal bridges, crosswind and flooding.'],
  [12, 'rome', 'Grande Raccordo Anulare', 'Grande Raccordo Anulare', 3, 2800, 'day', 0.55, 0.62, 1.12, ['potholes', 'curves', 'oilslicks'], 0.6, 0.16, 520, 'Schlaglöcher, Ölspuren und Vespas. Ciao!', 'Potholes, oil slicks and Vespas. Ciao!'],
  [13, 'barcelona', 'Ronda Litoral', 'Ronda Litoral', 5, 3200, 'day', 0.55, 0.65, 1.12, ['heat', 'festival', 'curves'], 0.45, 0.18, 550, 'Hitzeflimmern an der Küste, Fiesta in den Straßen.', 'Heat shimmer on the coast, fiesta in the streets.'],
  [14, 'newyork', 'FDR Drive', 'FDR Drive', 5, 3400, 'night', 0.6, 0.66, 1.14, ['traffic_jam', 'police', 'tunnels', 'night'], 0.2, 0.22, 600, 'Yellow Cabs, Stau und NYPD im Nacken.', 'Yellow cabs, gridlock and the NYPD on your tail.'],
  [15, 'losangeles', 'Mulholland Drive', 'Mulholland Drive', 5, 3500, 'dusk', 0.58, 0.66, 1.15, ['police', 'earthquake', 'curves'], 0.7, 0.2, 650, 'Serpentinen über Hollywood, und der Boden bebt.', 'Switchbacks above Hollywood, and the ground shakes.'],
  [16, 'mexicocity', 'Periférico', 'Periférico', 5, 3600, 'day', 0.6, 0.66, 1.15, ['earthquake', 'festival', 'potholes'], 0.35, 0.22, 680, 'Vochos, Schlaglöcher und Día-de-Muertos-Konfetti.', 'Vochos, potholes and Día de Muertos confetti.'],
  [17, 'rio', 'Avenida Niemeyer', 'Avenida Niemeyer', 5, 3700, 'dusk', 0.6, 0.68, 1.16, ['hills', 'curves', 'monsoon'], 0.65, 0.22, 700, 'Küstenkurven unter dem Zuckerhut, dann Monsun.', 'Coastal curves below Sugarloaf, then monsoon.'],
  [18, 'dubai', 'Sheikh Zayed Road', 'Sheikh Zayed Road', 5, 4000, 'day', 0.6, 0.7, 1.18, ['sandstorm', 'heat', 'nitro_pads'], 0.15, 0.24, 750, 'Zwölf Spuren Wüste, Sandsturm und Gold-Supersportler.', 'Desert highway, sandstorm and gold supercars.'],
  [19, 'cairo', 'Ringstraße Kairo', 'Cairo Ring Road', 5, 4000, 'dusk', 0.62, 0.68, 1.18, ['sandstorm', 'boss_tank', 'convoy'], 0.25, 0.28, 800, 'Ein Panzer blockiert die Straße zu den Pyramiden.', 'A tank blocks the road to the pyramids.'],
  [20, 'capetown', "Chapman's Peak Drive", "Chapman's Peak Drive", 5, 4200, 'day', 0.62, 0.7, 1.2, ['wind', 'curves', 'hills', 'oncoming'], 0.8, 0.22, 820, 'Klippenkurven, Kapwind und Minibus-Taxis von vorn.', 'Cliff curves, Cape wind and minibus taxis head-on.'],
  [21, 'mumbai', 'Marine Drive', 'Marine Drive', 5, 4300, 'day', 0.68, 0.66, 1.2, ['monsoon', 'traffic_jam', 'wrongway'], 0.3, 0.3, 850, 'Monsun, Rikschas und Falschfahrer. Hupen!', 'Monsoon, rickshaws and wrong-way drivers. Honk!'],
  [22, 'bangkok', 'Sukhumvit Road', 'Sukhumvit Road', 3, 3800, 'night', 0.66, 0.66, 1.2, ['flood', 'traffic_jam', 'night', 'neon'], 0.3, 0.26, 880, 'Enge Spuren, Tuk-Tuks und überflutete Straßen.', 'Tight lanes, tuk-tuks and flooded streets.'],
  [23, 'seoul', 'Olympic-Daero', 'Olympic Boulevard', 5, 4500, 'night', 0.64, 0.7, 1.22, ['neon', 'night', 'convoy', 'speed_cameras'], 0.3, 0.26, 900, 'Neon am Han-Fluss, Bus-Konvois, Blitzer.', 'Neon on the Han River, bus convoys, cameras.'],
  [24, 'shanghai', "Yan'an-Hochstraße", "Yan'an Elevated Road", 5, 4600, 'dusk', 0.65, 0.7, 1.22, ['fog', 'neon', 'boss_bus'], 0.35, 0.28, 950, 'Nebel über dem Bund und ein Bus-Boss.', 'Fog over the Bund and a bus boss.'],
  [25, 'hongkong', 'Cross-Harbour Tunnel', 'Cross-Harbour Tunnel', 5, 4700, 'night', 0.68, 0.72, 1.24, ['night', 'neon', 'tunnels', 'curves'], 0.5, 0.28, 1000, 'Neon-Schluchten, Tunnel und Doppeldecker-Trams.', 'Neon canyons, tunnels and double-deck trams.'],
  [26, 'sydney', 'Harbour Bridge', 'Harbour Bridge', 5, 4800, 'day', 0.66, 0.72, 1.25, ['bridge', 'wind', 'hills', 'construction'], 0.45, 0.28, 1050, 'Über die Harbour Bridge, gegen den Wind.', 'Across the Harbour Bridge, against the wind.'],
  [27, 'moscow', 'MKAD', 'MKAD', 5, 5000, 'night', 0.68, 0.72, 1.26, ['snow', 'ice', 'night', 'convoy'], 0.3, 0.32, 1100, 'Schnee, Blitzeis und Lada-Konvois auf dem Ring.', 'Snow, black ice and Lada convoys on the ring.'],
  [28, 'reykjavik', 'Ringstraße 1', 'Route 1', 3, 4500, 'night', 0.62, 0.7, 1.26, ['ice', 'aurora', 'snow', 'wind'], 0.6, 0.24, 1150, 'Polarlichter, Eis und Sturm auf enger Straße.', 'Northern lights, ice and gales on a narrow road.'],
  [29, 'lasvegas', 'The Strip', 'The Strip', 5, 5500, 'night', 0.72, 0.74, 1.3, ['neon', 'night', 'nitro_pads', 'meteor', 'police'], 0.2, 0.32, 1300, 'Neon-Wahnsinn, Meteoriten und die Cops. Alles auf Rot!', 'Neon madness, meteors and the cops. All in!'],
  [30, 'fukuoka', 'Fukuoka-Stadtautobahn', 'Fukuoka Urban Expressway', 5, 6000, 'night', 0.75, 0.76, 1.35, ['boss_tank', 'fireworks', 'night', 'curves', 'lava', 'blossom'], 0.6, 0.4, 1500, 'Das Finale: Panzer-Boss, Feuerwerk und glühender Asphalt.', 'The finale: tank boss, fireworks and glowing asphalt.'],
];

function stars(len: number, id: number): [number, number, number] {
  const k = 1 + id * 0.03;
  return [Math.round(len * 1.0 * k / 100) * 100, Math.round(len * 1.8 * k / 100) * 100, Math.round(len * 2.8 * k / 100) * 100];
}

export const LEVELS: LevelDef[] = ROWS.map((r) => ({
  id: r[0], city: r[1], name: { de: r[2], en: r[3] }, lanes: r[4], length: r[5], timeOfDay: r[6], density: r[7], trafficSpeed: r[8], speedMul: r[9],
  mechanics: r[10], curves: r[11], heavy: r[12], reward: r[13], stars: stars(r[5], r[0]), desc: { de: r[14], en: r[15] },
}));

export function getLevel(id: number): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
export const LEVEL_COUNT = LEVELS.length;
