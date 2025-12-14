import { Client, Account, Databases, Functions } from 'appwrite';

export const client = new Client();

client
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('693d29bb0011b426a67c');

export const account = new Account(client);
export const databases = new Databases(client);
export const functions = new Functions(client);