/** How many foods ship inside the app, as shown to people: "688,000+". */

import info from './foodsDbInfo.json';

export const FOOD_COUNT = `${(Math.floor(info.foods / 1000) * 1000).toLocaleString('en-US')}+`;
