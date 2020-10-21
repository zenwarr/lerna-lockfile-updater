#!/usr/bin/env node
import {updateLocks} from "./lib/Builder";


updateLocks().catch(error => {
  console.error(`Error while updating lockfiles: ${error.message}`, error);
});
