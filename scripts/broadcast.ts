#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { pushNotificationToUser } from '../src/utils/userUtils.js';

const usersDir = path.join('data', 'accounts');

interface BroadcastData {
  message: string;
  type?: string;
  [key: string]: unknown;
}

async function broadcast(): Promise<void> {
  try {
    // Read broadcast message
    const broadcastPath = './broadcast.json';
    const broadcastData = JSON.parse(await fs.readFile(broadcastPath, 'utf8')) as BroadcastData;
    broadcastData.type = 'broadcast';

    if (!broadcastData.message) {
      throw new Error('broadcast.json must contain a "message" field');
    }

    // Get all users
    const users = await fs.readdir(usersDir);
    const usernames = users.map(file => path.basename(file, '.json'));

    // Create broadcast notification
    const notification = {
      ...broadcastData,
      type: 'broadcast',
      timestamp: Date.now()
    };

    // Push to all users
    console.log(`Broadcasting message to ${usernames.length} users...`);
    await Promise.all(usernames.map(username => {
      console.log(`Pushing to ${username}`);
      return pushNotificationToUser(username, notification);
    }));

    console.log('Broadcast complete!');
  } catch (error) {
    console.error('Broadcast failed:', error);
    process.exit(1);
  }
}

broadcast();

