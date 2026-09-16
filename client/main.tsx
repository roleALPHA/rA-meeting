import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './App';
import './style.css';
import { ApiProvider } from './api-context';
import { legacyApi } from './api';
ReactDOM.render(<ApiProvider value={legacyApi}><App/></ApiProvider>, document.getElementById('root'));
