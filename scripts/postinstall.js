#!/usr/bin/env node

import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_FILE = 'aem-instances.yaml';
const TARGET_PATH = join(homedir(), CONFIG_FILE);
const EXAMPLE_PATH = join(__dirname, '..', 'examples', 'aem-instances.example.yaml');

console.log('🔧 AEM MCP Server - First-run setup...');

try {
  // Check if example file exists (it should, but let's be safe)
  if (!existsSync(EXAMPLE_PATH)) {
    console.log('⚠️  Example configuration file not found. Skipping setup.');
    process.exit(0);
  }

  // Check if user already has a configuration file
  if (existsSync(TARGET_PATH)) {
    console.log(`✓ Configuration already exists at ${TARGET_PATH}`);
    console.log('  No changes made to preserve your existing settings.');
  } else {
    // Copy the example to user's home directory
    copyFileSync(EXAMPLE_PATH, TARGET_PATH);
    console.log(`✓ Created default configuration at ${TARGET_PATH}`);
    console.log('  Please update it with your AEM instance credentials.');
    console.log('');
    console.log('📖 Next steps:');
    console.log('  1. Edit ~/aem-instances.yaml with your AEM server details');
    console.log('  2. Replace "changeme" passwords with actual credentials');
    console.log('  3. Remove or comment out environments you don\'t need');
  }
} catch (error) {
  console.error('❌ Could not create default configuration:');
  console.error(`   ${error.message}`);
  console.log('');
  console.log('💡 You can manually copy the example file:');
  console.log(`   cp ${EXAMPLE_PATH} ${TARGET_PATH}`);
  
  // Exit with non-zero code but don't fail the installation
  // This ensures npm install continues even if config setup fails
  process.exit(0);
}