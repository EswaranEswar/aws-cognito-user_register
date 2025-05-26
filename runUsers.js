import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// const generateUsers = (count) => {
//   const users = [];
//   for (let i = 1; i <= count; i++) {
//     users.push({
//       email: `newuser${i}@example.com`,
//       password: 'Test@123'
//     });
//   }
//   return users;
// };

// const userCount = 100; // Set the desired number of users
// const users = generateUsers(userCount);

// const COGNITO_URL = 'http://localhost:3000/users/login';
// const APP_LOGIN_URL = 'https://app.qa.astraops.ai/api/auth/signin';


// // Add this function to log detailed response for debugging
// const logResponse = (response) => {
//   console.log('Response status:', response.status);
//   // console.log('Response headers:', response.headers);
//   console.log('Response data structure:', Object.keys(response.data));
// };

// const extractConneditCookie = (headers) => {
//     const cookies = headers['set-cookie'];
//     if (cookies) {
//         for (const cookie of cookies) {
//             if (cookie.startsWith('connect.sid=')) {
//                 return cookie.split(';')[0].split('=')[1];
//             }
//         }
//     }
//     return null;
// }

// const main = async () => {

//   for (const user of users) {
//     try {
//       const cognitoResponse = await axios.post(COGNITO_URL, {
//         email: user.email,
//         password: user.password
//       });

//       let accessToken;
//       if (cognitoResponse.data?.result?.accessToken) {
//         accessToken = cognitoResponse.data.result.accessToken;
//       } else if (cognitoResponse.data?.results) {
//         const userLoginResult = cognitoResponse.data.results.find(
//           (entry) => entry.email === user.email && entry.status === 'success'
//         );
//         accessToken = userLoginResult?.result?.tokens?.result?.tokens?.accessToken;
//       } else if (cognitoResponse.data?.accessToken) {
//         accessToken = cognitoResponse.data.accessToken;
//       } else if (cognitoResponse.data?.AuthenticationResult?.AccessToken) {
//         accessToken = cognitoResponse.data.AuthenticationResult.AccessToken;
//       } else {
//         // Log an error if no token is found
//         console.error(`No access token found in response for ${user.email}`);
//       }
//       k
//       if (!accessToken) {
//         console.error(`No access token for ${user.email}`);
//         continue;
//       }

//       const jar = new CookieJar();
//       const client = wrapper(axios.create({ jar }));

//       try {
//         const loginResponse = await client.get(
//           APP_LOGIN_URL,
//           {
//             headers: {
//               Authorization: `Bearer ${accessToken}`,
//               'Content-Type': 'application/json',
//               Referer: 'https://app.beta.astraops.ai'
//             },
//           }
//         );
        
//         console.log(`Login response status: ${loginResponse.status}`);
//         logResponse(loginResponse);

//         const conneditCookie = extractConneditCookie(loginResponse.headers);

//         if (conneditCookie) {
//           const cookiesFilePath = path.join(__dirname, 'cookies.json');
          
//           let cookiesData;
//           try {
//             const fileContent = fs.readFileSync(cookiesFilePath, 'utf8');
//             cookiesData = fileContent ? JSON.parse(fileContent) : { cookies: [{}] };
//           } catch (parseError) {
//             console.error(`Error parsing cookies.json:`, parseError);
//             cookiesData = { cookies: [{}] }; // Initialize with default structure
//           }

//           // Ensure the structure exists before setting the property
//           if (!cookiesData.cookies[0]) {
//             cookiesData.cookies[0] = {};
//           }

//           // Update the sessionId value
//           cookiesData.cookies[0].sessionId = conneditCookie;

//           // Write the updated JSON back to the file
//           fs.writeFileSync(cookiesFilePath, JSON.stringify(cookiesData, null, 2));
//         }
//       } catch (loginErr) {
//         console.error(`Login error for ${user.email}:`, loginErr);
//       }
//     } catch (error) {
//       console.error(`Error during Cognito login for ${user.email}:`, error);
//     }
//   }
// };

// main();



//===============================================================================================//


const config = {
  cognito: {
    url: process.env.COGNITO_URL || 'http://localhost:3000/users/login',
    timeout: 5000
  },
  app: {
    loginUrl: process.env.APP_LOGIN_URL || 'https://app.qa.astraops.ai/api/auth/signin',
    referer: 'https://app.qa.astraops.ai'
  },
  paths: {
    users: path.join(__dirname, 'faker-users.json'),
    cookies: path.join(__dirname, 'cookies.json')
  },
  concurrency: 5
};

async function processUser(user) {
  try {
    
    const cognitoFullResponse = await axios.post(config.cognito.url, {
      email: user.email,
      password: user.password
    }, { timeout: config.cognito.timeout });
    const cognitoData = cognitoFullResponse.data;
    console.log('Response status:', cognitoFullResponse.status);
    console.log('Response data structure:', Object.keys(cognitoFullResponse.data));

    let accessToken;
    if (cognitoData?.result?.token?.accessToken) {
      accessToken = cognitoData.result.token.accessToken;
    } else if (cognitoData?.result?.accessToken) {
      accessToken = cognitoData.result.accessToken;
    } else if (cognitoData?.tokens?.accessToken) {
      accessToken = cognitoData.tokens.accessToken;
    } else if (cognitoData?.AuthenticationResult?.AccessToken) {
      accessToken = cognitoData.AuthenticationResult.AccessToken;
    } else if (cognitoData?.accessToken) {
      accessToken = cognitoData.accessToken;
    } else if (cognitoData?.results && Array.isArray(cognitoData.results)) {
      const userLoginResult = cognitoData.results.find(
        (entry) => entry.email === user.email && entry.status === 'success'
      );
      accessToken = userLoginResult?.result?.tokens?.result?.tokens?.accessToken;
    }

    if (!accessToken) {
      throw new Error('No access token received after checking known paths');
    }

    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));
    
    const appLoginFullResponse = await client.get(config.app.loginUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Referer: config.app.referer
      },
      timeout: config.cognito.timeout
    });

    console.log(`Login response status: ${appLoginFullResponse.status}`);

    saveCookies(user.email, appLoginFullResponse.headers['set-cookie']);
    return { success: true };
    
  } catch (error) {
    console.error(`Failed ${user.email}:`, error.response?.data || error.message);
    return { success: false, error };
  }
}

function saveCookies(email, cookies) {
  const cookiesPath = config.paths.cookies;
  let data = { cookies: [] };

  // Try to read and parse the existing cookies file
  try {
    if (fs.existsSync(cookiesPath)) {
      const fileContent = fs.readFileSync(cookiesPath, 'utf-8');
      if (fileContent.trim()) {
        data = JSON.parse(fileContent);
        if (!data.cookies || !Array.isArray(data.cookies)) {
          data.cookies = [];
        }
      }
    }
  } catch (e) {
    console.warn(`Error reading cookies file: 
      ${e.message}. Initializing with default structure.`);
    data = { cookies: [] };
  }

  // Extract connect.sid value from cookies array
  let connectSidValue = null;
  if (Array.isArray(cookies)) {
    for (const cookieStr of cookies) {
      const [cookieName, ...cookieValueParts] = cookieStr.split(';')[0].split('=');
      if (cookieName.trim() === 'connect.sid') {
        connectSidValue = cookieValueParts.join('=');
        break;
      }
    }
  }

  // Store the connect.sid value under the user's email
  if (connectSidValue) {
    // Directly push the connect.sid value to the cookies array
    data.cookies.push({ "connect.sid": connectSidValue });
  } else {
    console.warn(`'connect.sid' cookie not found for ${email}`);
  }

  // Write back to file
  fs.writeFileSync(cookiesPath, JSON.stringify(data, null, 2));
}

// Main execution
(async () => {
  try {
    const users = JSON.parse(fs.readFileSync(config.paths.users, 'utf-8'));
    let success = 0, failures = 0;
    
    for (let i = 0; i < users.length; i += config.concurrency) {
      const batch = users.slice(i, i + config.concurrency);
      const results = await Promise.all(batch.map(user => processUser(user)));
      
      results.forEach(result => {
        result.success ? success++ : failures++;
      });
      
      console.log(`Processed batch ${i / config.concurrency + 1}`);
    }
    
    console.log(`Completed: ${success} success, ${failures} failures`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();