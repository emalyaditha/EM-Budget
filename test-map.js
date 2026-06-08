const debtsCols = ['id', 'user_email', 'debt_source', 'total_amount', 'remaining_amount', 'due_date', 'notes', 'payments', 'account_id', 'account_type', 'account_name', 'updated_at'];

function mapObjectToColumns(item, columns, email, mappingRules) {
  const result = {};
  
  // Set identity binding
  if (columns.includes('user_email')) {
    result['user_email'] = email;
  }
  
  // Set timestamp marker
  if (columns.includes('updated_at')) {
    result['updated_at'] = new Date().toISOString();
  }

  for (const [colName, val] of Object.entries(mappingRules)) {
    if (columns.includes(colName)) {
      result[colName] = val;
    }
  }

  for (const col of columns) {
    if (col === 'user_email' || col === 'updated_at') continue;
    if (result[col] !== undefined) continue;
    if (item[col] !== undefined) {
      result[col] = item[col];
      continue;
    }
    
    // Automatically match snake <-> camel casings
    const camel = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const snake = col.replace(/([A-Z])/g, '_$1').toLowerCase();

    if (item[camel] !== undefined) {
      result[col] = item[camel];
    } else if (item[snake] !== undefined) {
      result[col] = item[snake];
    }
  }
  return result;
}

const item = {
  id: 'str',
  debtSource: 'test',
  totalAmount: 100,
  remainingAmount: 100,
  dueDate: '123',
  notes: 'hello',
  payments: [{ id: 'p1', amount: 50 }],
  accountId: 'a1',
  accountType: 'cash',
  accountName: 'N1'
};

console.log(mapObjectToColumns(item, debtsCols, 'foo@bar.com', {
  id: item.id,
  debt_source: item.debtSource,
  total_amount: item.totalAmount,
  remaining_amount: item.remainingAmount,
  due_date: item.dueDate,
  notes: item.notes || null,
  account_id: item.accountId || null,
  account_type: item.accountType || null,
  account_name: item.accountName || null
}));
