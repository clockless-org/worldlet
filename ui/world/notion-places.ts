// Spatial vocabulary describes this person's facilities, not a settlement or businesses.
const places = {
  factory: ['factory','Code workshop','Enter workshop','Workshop floor','Project archive','View projects'],
  home: ['home','Home','Enter home','Inside','Bookshelf','Browse bookshelves'],
  library: ['pavilion','Woodland library','Enter library','Book nook','Bookshelf','Browse bookshelves'],
  studio: ['workshop','Workshop','Enter workshop','Workbench','Project shelf','Explore work'],
  cafe: ['picnic','Shaded gathering spot','Take a seat','Under the trees','Contact journal','Open journal'],
  family: ['playground','Play nook','Take a closer look','Play nook','Family journal','Open family journal'],
  calendar: ['memory','Memory garden','Enter garden','Garden','Memory book','Browse memories'],
  finance: ['planning','Planning desk','Take a seat','At the desk','Ledger','Open ledger'],
  archive: ['storage','Collection cabinet','Take a closer look','At the cabinet','Archive','Open collections'],
  rocket: ['camp','Travel camp','Enter camp','Camp','Travel journal','Open journal'],
  health: ['exercise','Activity lawn','Visit the lawn','Lawn','Journal','Browse records'],
  vision: ['observatory','Lookout','Visit the lookout','Platform','Idea book','Browse ideas'],
  garden: ['greenhouse','Greenhouse','Enter greenhouse','Greenhouse','Garden journal','Open journal']
};
export function describePlace(theme) {
  const [kind,name,enter,inside,shelf,browse]=places[theme]||places.library;
  return {kind,name,enter,inside,shelf,browse};
}
