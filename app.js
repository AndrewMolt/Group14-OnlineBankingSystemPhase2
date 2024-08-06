const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { ObjectId } = require('mongodb');
const { MongoClient } = require('mongodb');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Connecting to MongoDB
mongoose.connect("mongodb+srv://andrumolt:test123@cluster0.jlchpmi.mongodb.net/accounts");

// Schema definitions
const accountsSchema =
{
  accountnum: Number,
  accountpassword: String,
  balance: Number,
  routingnum: Number,
  directdepositnum: Number,
  wiretransfernum: Number
};

const transferHistorySchema =
{
  sending_account_num: Number,
  receiving_account_num: Number,
  amount: Number,
  status: String,
  date:
  { type: Date, default: Date.now },
  note: String
};

const contactListSchema =
{
  user_account: Number,
  contact_account: Number,
  contact_nickname: String
};

const Account = mongoose.model("account", accountsSchema);
const TransferHistory = mongoose.model('transfer_history', transferHistorySchema);
const ContactList = mongoose.model('contact_list', contactListSchema);

// Function to check passwords
function checkPasswords(testnum, testpass)
{
  // Simplified for brevity
  const validAccounts =
  {
    1234567890: "password",
    132161597: "password",
    343726692: "password",
    740013224: "password",
    377336819: "password" // Super rich account
  };

  return validAccounts[testnum] === testpass;
}

// Function to update the account dashboard
async function updateDashboard(accountnumber)
{
  const newAccount = await Account.findOne({ accountnum: accountnumber }, "accountnum accountpassword balance routingnum directdepositnum wiretransfernum");
  return newAccount;
}

async function getTransferHistory(accountnum)
{
    const transactions = await TransferHistory.find({
      $or: [
          { sending_account_num: accountnum },
          { receiving_account_num: accountnum }
          ]
        }, "sending_account_num receiving_account_num amount status note date").sort({ date: -1 }); // Sort by date descending}

    return transactions;
}

// Function to get the balance of a specific account
async function getBalance(accountNumber)
{
  try
  {
    //console.log(`Fetching balance for account number: ${accountNumber}`); // Debug log
    const account = await Account.findOne({ accountnum: accountNumber });
    if (!account) throw new Error('Account not found');
    return account.balance;
  }
  catch (error)
  {
    console.error('Error fetching balance:', error);
    throw error;
  }
}


// Function to set the balance of a specific account
const setBalance = async (accountNumber, newBalance) =>
{
  try
  {
    const account = await Account.findOneAndUpdate(

     { accountnum: accountNumber },

     { balance: newBalance },

     { new: true } // This option returns the updated document
    );
    if (account)

   {
      return account.balance;
    }
    else
    {
      throw new Error('Account not found');
    }
  }
  catch (error)
  {
    console.error("Error setting balance:", error);
    return null;
  }
};

// Function to add money to an account
const addMoney = async (accountNumber, amount) =>
{
  try
  {
    const currentBalance = await getBalance(accountNumber);
    if (currentBalance !== null)

   {
      const newBalance = currentBalance + amount;
      const updatedBalance = await setBalance(accountNumber, newBalance);
      return updatedBalance;
    }
    else
    {
      throw new Error('Failed to retrieve current balance');
    }
  }
  catch (error)
  {
    console.error("Error adding money:", error);
    return null;
  }
};

// Function to subtract money from an account
const subtractMoney = async (accountNumber, amount) =>
{
  try
  {
    const currentBalance = await getBalance(accountNumber);
    if (currentBalance !== null)

   {
      if (currentBalance >= amount)

     {
        const newBalance = currentBalance - amount;
        const updatedBalance = await setBalance(accountNumber, newBalance);
        return updatedBalance;
      }
      else
      {
        throw new Error('Insufficient balance');
      }
    }
    else
    {
      throw new Error('Failed to retrieve current balance');
    }
  }
  catch (error)
  {
    console.error("Error subtracting money:", error);
    return null;
  }
};

// Function to add a transaction record
async function addTransaction(data)
{
  try
  {
    // Ensure proper data types are being used
    const transaction = new TransferHistory({
      sending_account_num: data.sending_account_num,
      receiving_account_num: data.receiving_account_num,
      amount: data.amount,
      status: data.status,
      note: data.note,
    });

    await transaction.save();
    console.log("Transaction recorded successfully");
  }
  catch (error)
  {
    console.error("Error saving transaction:", error);
  }
}


// Function to transfer money between accounts
async function transferMoney(transferFrom, transferTo, amount, note)
{
  let transactionRecorded = false;

  try
  {
    let parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0)
    {
      throw new Error("Invalid amount.");
    }

    const sendingAccount = await Account.findOne({ accountnum: transferFrom });
    const receivingAccount = await Account.findOne({ accountnum: transferTo });

    if (!sendingAccount)
    {
      throw new Error(`Sending account ${transferFrom} not found.`);
    }

    if (!receivingAccount)
    {
      throw new Error(`Receiving account ${transferTo} not found.`);
    }

    if (sendingAccount.balance < parsedAmount)
    {
      throw new Error("Insufficient balance.");
    }

    await subtractMoney(transferFrom, parsedAmount);
    await addMoney(transferTo, parsedAmount);

    // Record transaction as complete
    await addTransaction({
      sending_account_num: transferFrom,
      receiving_account_num: transferTo,
      amount: parsedAmount,
      status: "Complete",
      note: note || ""
    });

    transactionRecorded = true;
    console.log("Transfer completed successfully.");
  }
  catch (error)
  {
    console.error("Error during transfer:", error.message);

    // Record transaction as failed only if it hasn't been recorded already
    if (!transactionRecorded)
    {
      await addTransaction({
        sending_account_num: transferFrom,
        receiving_account_num: transferTo,
        amount: parseFloat(amount),
        status: "Failed",
        note: error.message
      });
    }

    throw error; // Re-throw the error to handle it in the route
  }
};

const addOrUpdateContact = async (userAccount, contactAccount, nickname) =>
{
  try
  {
    // Check if the contact already exists for the user
    const existingContact = await ContactList.findOne({
      user_account: userAccount,
      contact_account: contactAccount
    });

    if (existingContact)
    {
      // Update the contact's nickname
      existingContact.contact_nickname = nickname;
      await existingContact.save();
      console.log('Contact updated successfully.');
    }
    else
    {
      // Add new contact information
      const newContact = new ContactList({
        user_account: userAccount,
        contact_account: contactAccount,
        contact_nickname: nickname
      });

      await newContact.save();
      console.log('Contact added successfully.');
    }
  }
  catch (error)
  {
    console.error('Error adding or updating contact:', error);
  }
};



// Login route
app.post("/login", function (req, res)
{
  const attemptNumber = req.body.loginEmail;
  const attemptPassword = req.body.loginPassword;
  if (checkPasswords(attemptNumber, attemptPassword))

 {
    updateDashboard(attemptNumber).then(result =>
    {

      const newAccount = result;
      getTransferHistory(attemptNumber).then(result =>
      {
        const transactions = result;
        res.render("accountdashboard",
          { account: newAccount, transactions});
      });

    });

  }
  else
  {
    res.redirect("/");
  }
});

// Logout route
app.post("/logout", function (req, res)
{
  res.render("loginpage");
});

// app.post("/backtodashboard", async (req, res) =>
// {
//   const {transferFrom} = req.query;
//   console.log(transferFrom);
//   updateDashboard(accountnum).then(result =>
//   {
//
//     const newAccount = result;
//     getTransferHistory(accountnum).then(result =>
//     {
//       const transactions = result;
//       res.render("accountdashboard",
//         { account: newAccount, transactions});
//     });
//
//   });
// });

// Account transfer page route
app.get('/account_transfer', async (req, res) => {
    const { accountnum, from, to, message } = req.query;

    try {
        // Fetch account details and balance
        const account = await Account.findOne({ accountnum: from || accountnum }); // Use 'from' or fallback to 'accountnum'
        if (!account) {
            throw new Error('Account not found');
        }

        // Fetch transactions involving the account number, either as sender or receiver
        const transactions = await TransferHistory.find({
            $or: [
                { sending_account_num: from || accountnum },
                { receiving_account_num: from || accountnum }
            ]
        }).sort({ date: -1 }); // Sort by date descending

        // Render the account transfer page with the account details, transactions, and optional message
        res.render('accounttransfer', {
            account,
            transactions,
            message,
            from: from || accountnum, // Pass the 'from' value for autofilling
            to: to || '' // Pass the 'to' value for autofilling, default to empty if not provided
        });
    } catch (error) {
        console.error("Error retrieving account or transactions:", error.message);
        res.render('accounttransfer', {
            account: null,
            transactions: [],
            message: error.message,
            from: '',
            to: ''
        });
    }
});



// For rerouting to the dashboard
app.get('/account_dashboard', async (req, res) =>
{
    const
    { accountnum, message } = req.query;
    try
    {
        // Fetch account details based on accountnum
        const account = await Account.findOne({ accountnum });
        res.render('accountdashboard',
          { account, message });
    }
    catch (error)
    {
         res.status(500).send('Error retrieving account details.');
    }
});


// Main page route
app.get("/", function (req, res)
{
  res.render("loginpage");
});



// Bill Payment route
app.get('/billpayment', async (req, res) => {
  try {
    const userAccount = parseInt(req.query.accountnum);
    if (isNaN(userAccount)) throw new Error('Invalid user account number.');

    const contacts = await ContactList.find({ user_account: userAccount }).sort({ contact_nickname: 1 }).exec();
    res.render('billpayment', { account: { accountnum: userAccount }, contacts });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).send('Error fetching contacts');
  }
});

// Account History route
app.get('/account_history', async (req, res) => {
    const { accountnum, sort } = req.query;

    try {
        // Fetch account details
        const account = await Account.findOne({ accountnum: accountnum });
        if (!account) {
            throw new Error('Account not found');
        }

        // Fetch transactions involving the account number, either as sender or receiver
        const query = {
            $or: [
                { sending_account_num: accountnum },
                { receiving_account_num: accountnum }
            ]
        };

        let transactions = await TransferHistory.find(query).sort({ date: -1 }); // Sort by date descending

        if (sort && sort !== 'All') {
            transactions = transactions.filter(transaction => transaction.note === sort);
        }

        // Categorize transactions for the pie chart
        const categories = {
            'Bills & Utilities': 0,
            'Person to Person': 0,
            Entertainment: 0,
            'Food & Drink': 0,
            Shopping: 0,
            Other: 0
        };

        transactions.forEach(transaction => {
            switch (transaction.note) {
                case 'Bills & Utilities':
                    categories['Bills & Utilities'] += transaction.amount;
                    break;
                case 'Person to Person':
                    categories['Person to Person'] += transaction.amount;
                    break;
                case 'Entertainment':
                    categories.Entertainment += transaction.amount;
                    break;
                case 'Food & Drink':
                    categories['Food & Drink'] += transaction.amount;
                    break;
                case 'Shopping':
                    categories.Shopping += transaction.amount;
                    break;
                default:
                    categories.Other += transaction.amount;
                    break;
            }
        });

        res.render('accounthistory', { account, transactions, categories, selectedCategory: sort || 'All' });
    } catch (error) {
        console.error("Error retrieving account or transactions:", error.message);
        res.render('accounthistory', { account: null, transactions: [], categories: {}, selectedCategory: 'All', message: error.message });
    }
});


// Transfer route
app.post('/transfer', async (req, res) =>
{
    const { transferFrom, transferTo, amount, transferDate, noteDropdown, note } = req.body;

    const finalNote = noteDropdown === "other" ? note : noteDropdown;

    try
    {
        await transferMoney(transferFrom, transferTo, amount, finalNote);
        res.redirect(`/account_transfer?accountnum=${transferFrom}&message=${encodeURIComponent('Transfer completed successfully.')}`);
    }
    catch (error)
    {
        console.error('Error during transfer:', error);
        res.redirect(`/account_transfer?accountnum=${transferFrom}&message=${encodeURIComponent(error.message)}`);
    }
});

// Update contacts route
app.post('/addOrUpdateContact', async (req, res) => {
  try {
    const userAccount = parseInt(req.body.accountnum, 10);
    const contactAccount = parseInt(req.body.contactAccount, 10);
    const contactNickname = req.body.contactNickname;
    console.log('Received accountnum:', req.body.accountnum);
    console.log('Received contactAccount:', req.body.contactAccount);
    console.log('Received contactNickname:', req.body.contactNickname);


    if (isNaN(userAccount) || isNaN(contactAccount)) {
      throw new Error('Invalid user account number or contact account number.');
    }

    await addOrUpdateContact(userAccount, contactAccount, contactNickname);
    res.redirect(`/billpayment?accountnum=${userAccount}`);
  } catch (error) {
    console.error('Error adding or updating contact:', error);
    res.status(500).send('Error adding or updating contact');
  }
});






app.listen(process.env.PORT || 3000, function() {
  console.log("Server started succesfully via Heroku.");
});
