// Handwritten fictional content only. Never read or derive this from a private export.
const examples: [string,string,[string,string][]][] = [
  ['home', 'Life & home', [
    ['Moving checklist', 'Leave things to remember here, and free up a little headspace.\n\n- [x] Sort the things to take with you\n- [ ] Compare moving dates\n- [ ] Choose a spot for the desk'],
    ['Sell the car', 'Get a car valuation before the move.\n\n## Desired outcome\nFind the right buyer and make time for the handover.\n\n## Next step\nGather the model, mileage, and service history. This demo has not sent a request to any external agent.'],
    ['A guide to your world', 'Enter a place, approach the bookshelf, and open a book.\n\nExplore one layer at a time, or type “Moving checklist” below. Press Esc to go back.']
  ]],
  ['library', 'Reading & learning', [['Reading list', 'Keep a quiet spot for stories you have yet to finish.\n\n- [ ] A book about nature\n- [ ] An essay collection on architecture'], ['Learning plan', 'Choose one small question to explore this week.\n\nSpend twenty minutes a day and write down one discovery.']]],
  ['factory', 'GitHub', [['World engine', 'An interactive GitHub workshop. No real repository is connected.\n\n## Project\nPersonal world engine: turn sources into places to explore.\n\nPR, BUILD, and APP on the conveyor represent changes, builds, and releases. The animation is illustrative, not a live build.'], ['Build log', 'This is a fictional build log.\n\n- [x] Check code\n- [x] Build the web app\n- [ ] Await release approval\n\nOnce connected, this can show GitHub Actions status and original links.'], ['Changes in review', 'Pull request: enrich the world.\n\n## Your next step\nExplore the scene changes and share feedback.\n\nThe workshop keeps project context together. Your chosen tools or agents handle coding and releases.']]],
  ['studio', 'Creation & projects', [['World prototype', 'The sense of place of a game, with the speed and clarity of an app.\n\nClicks respond immediately. Animation explains what changed.'], ['Idea journal', 'Perhaps everything can have a familiar place.\n\nBooks hold knowledge. Desks hold work in progress.']]],
  ['cafe', 'Friends & connections', [['Weekend catch-up', 'Find an afternoon for an unhurried conversation.\n\n- [ ] Suggest two possible times\n- [ ] Choose a nearby cafe']]],
  ['family', 'Family & growth', [['School enrollment', 'Break the paperwork into steps. No need to remember it all at once.\n\n- [x] Gather the document checklist\n- [ ] Review the application form\n- [ ] Confirm the school deadline']]],
  ['calendar', 'Daily life & memories', [['A beautiful day', 'Today I walked down a path I had never taken before.\n\nI want to remember the shadows of trees on the water.']]],
  ['finance', 'Budget & planning', [['Moving budget', 'This is a fictional budgeting exercise, not account data.\n\n| Project | Budget |\n| --- | --- |\n| Moving | Get a quote |\n| Furniture | To compare |\n| Reserve | To decide |']]],
  ['archive', 'Sources & collections', [['Archive', 'Finished things have a place here, too.\n\nKeep manuals, finished projects, and anything you may want to revisit.']]],
  ['rocket', 'Travel & exploration', [['Weekend camping', 'A short getaway close to the city.\n\n- [ ] Check the weather\n- [ ] Check the tent\n- [ ] Pack water and lights']]],
  ['health', 'Movement & rest', [['Walking plan', 'Step outside for a walk between tasks.\n\nMaking room for rest is a plan, too.']]],
  ['vision', 'Wishes & future', [['Little things to try', 'Learn a recipe, repair something old, or watch a sunrise.\n\nLeave a wish here until the time feels right.']]]
];
const pages = [];
const spaces = examples.map(([theme, title, notes]) => ({
  id: 'place-' + theme, theme, title,
  children: notes.map(([title, body], i) => {
    const id = 'sample-' + theme + '-' + (i + 1);
    const path = id + '.md';
    pages.push({ id, title, kind: 'page', parent: 'sample-root', children: [], path, paths: [path], markdown: '# ' + title + '\n\n' + body, text: title + '\n' + body });
    return id;
  })
}));
pages.unshift({ id: 'sample-root', title: 'My world', kind: 'page', parent: null, children: pages.map(p => p.id), path: 'world.md', paths: ['world.md'], markdown: '', text: '' });
export const sampleWorld = {
  version: 1, sample: true, workspace: 'Sample world', roots: ['sample-root'], pages, spaces, assets: [],
  coverage: { pages: pages.length, databases: 0, rows: 0, assets: 0, scope: 'Handwritten fictional content. No user data included.', problems: [] }
};
