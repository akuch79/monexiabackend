const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Budget = require('../models/Budget');

exports.createTransaction = async (req, res, next) => {
  try {
    const transactionData = {
      ...req.body,
      userId: req.user.id
    };

    const transaction = new Transaction(transactionData);
    await transaction.save();

    // Update account balance
    const account = await Account.findById(transaction.accountId);
    if (account) {
      const balanceChange = transaction.type === 'expense' 
        ? -transaction.amount 
        : transaction.amount;
      
      if (transaction.type === 'transfer') {
        // Handle transfer logic
        if (transaction.toAccountId) {
          await Account.findByIdAndUpdate(transaction.toAccountId, {
            $inc: { balance: transaction.amount }
          });
        }
        // Don't change source account balance for transfers
      } else {
        account.balance += balanceChange;
        await account.save();
      }
    }

    // Update budget spent amount
    if (transaction.categoryId && transaction.type === 'expense') {
      await Budget.findOneAndUpdate(
        { 
          userId: req.user.id, 
          categoryId: transaction.categoryId,
          startDate: { $lte: transaction.date },
          endDate: { $gte: transaction.date }
        },
        { $inc: { spentAmount: transaction.amount } }
      );
    }

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    next(error);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      type,
      categoryId,
      accountId,
      search
    } = req.query;

    const query = { userId: req.user.id };

    // Apply filters
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (type) query.type = type;
    if (categoryId) query.categoryId = categoryId;
    if (accountId) query.accountId = accountId;
    
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } }
      ];
    }

    const transactions = await Transaction.find(query)
      .populate('accountId', 'name type')
      .populate('categoryId', 'name color icon')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    next(error);
  }
};

exports.getTransactionStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      userId: req.user.id
    };

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const stats = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await Transaction.aggregate([
      { $match: { ...matchStage, type: 'expense' } },
      {
        $group: {
          _id: '$categoryId',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $project: {
          categoryName: '$category.name',
          categoryColor: '$category.color',
          total: 1,
          count: 1
        }
      },
      { $sort: { total: -1 } }
    ]);

    const dailyStats = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          income: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] }
          },
          expenses: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      summary: stats,
      byCategory: categoryStats,
      daily: dailyStats
    });
  } catch (error) {
    next(error);
  }
};