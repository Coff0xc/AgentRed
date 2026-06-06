#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { TuiApp } from '../src/cli/tui/tui-app.js';

// Parse command line arguments
const args = process.argv.slice(2);
const apiUrl = args.find((arg) => arg.startsWith('--url='))?.split('=')[1] || 'http://127.0.0.1:4317';
const token = args.find((arg) => arg.startsWith('--token='))?.split('=')[1] || process.env.PLATFORM_API_TOKEN;

if (!token) {
  console.error('Error: PLATFORM_API_TOKEN environment variable or --token argument is required');
  process.exit(1);
}

// Render the TUI app
render(<TuiApp apiUrl={apiUrl} token={token} />);
