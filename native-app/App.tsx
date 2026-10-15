import React, {useEffect} from 'react';
import NativeApp from './src/App';
import {push, services, startRuntime} from './src/platform/runtime';
import {createStoreUpdates} from './src/platform/app-updates';
const updates = createStoreUpdates();

export default function App() {
  useEffect(startRuntime, []);
  return <NativeApp services={services} push={push} updates={updates}/>;
}
