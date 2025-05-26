export type BaseUserDetail = {
    name: string;
    email: string;
  };
  
  export type User = {
    name: string;
    email: string;
  };
  
  import * as fs from 'fs';
  import * as path from 'path';
  
  export function generateUsersFromBase(base: BaseUserDetail, count: number): User[] {
    if (!base.email) {
      throw new Error('Missing "email" in request body');
    }
  
    const users: User[] = [];
    const [localPart, domain] = base.email.split('@');
  
    for (let i = 1; i <= count; i++) {
      users.push({
        name: `${base.name}${i}`,
        email: `${localPart}${i}@${domain}`,
      });
    }
  
    const filePath = path.join(__dirname, '../../generated-users.json');
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf-8');
  
    console.log(`Saved ${users.length} users to ${filePath}`);
    console.log(users);
  
    return users;
  }
  