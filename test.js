const axios = require('axios');

const testFast2SMS = async () => {
  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        numbers: '9715778831',
        variables_values: '123456',
        flash: 0
      },
      {
        headers: {
          authorization: 'H0yBUoTvPramOrwj3fDxlWiIoc3sXj264dHv9ucqJ1NycPhO8xbgyc9nRZHU', // Replace with your actual API key
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    console.log('Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
};

testFast2SMS();