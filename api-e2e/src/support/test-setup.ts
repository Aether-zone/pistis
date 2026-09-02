/* eslint-disable */
import axios from 'axios';

import { API_URL } from './ports';

module.exports = async function () {
  // Configure axios for tests to use.
  axios.defaults.baseURL = API_URL;
};
