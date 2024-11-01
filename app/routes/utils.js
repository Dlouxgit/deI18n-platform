// const json = {
//   "income": {
//     "accountsReceivable": {
//       "pageTitle": "Accounts Receivable Management",
//       "filter": {
//         "keyword": "Keyword",
//         "zhou": "Report Period"
//       },
//       "placeholder": {
//         "text1": "Enter keywords to search"
//       },
//       "messageBox": {
//         "sure": "Confirm",
//         "title": "Matching Complete",
//         "text": "Successfully matched {successCount} receivable data entries, failed to match {failCount} entries",
//         "title1": "Approve Receivable Data?",
//         "desc1": "Are you sure to approve the selected data? After approval, the corresponding platform's revenue will be shown as received!"
//       },
//       "list": {
//         "createTime": "Creation Time",
//         "incomeNum": "Receivable Number",
//         "platformName": "Platform",
//         "customerName": "Customer",
//         "cycle": "Report Period",
//         "incomeCompany": "Receiving Company",
//         "dspList": "DSP List",
//         "dspListMore": "View All",
//         "dspListDialogTitle": "View All DSP",
//         "paymentCompany": "Paying Company",
//         "status": "Status",
//         "shouldIncome": "Report Amount",
//         "taxRate": "Tax Rate",
//         "realShouldIncome": "Actual Receivable",
//         "realIncome": "Received"
//       },
//       "button": {
//         "text1": "Match",
//         "text2": "Review",
//         "text3": "Cancel Match",
//         "text4": "Details",
//         "text5": "Maximum Amount",
//         "text6": "Receipt Match",
//         "text7": "Batch Review",
//         "text8": "Confirm Match",
//         "text9": "Confirm Receipt",
//         "text10": "Modify Match"
//       },
//       "dialogTitle": {
//         "text1": "Receipt Matching",
//         "text2": "Match Result Review"
//       },
//       "title": {
//         "text1": "Actual Receivable Amount",
//         "text2": "Receipt Matching Result",
//         "text3": "Matched Amount"
//       },
//       "form": {
//         "label1": "Report Receivable",
//         "label2": "Tax Rate",
//         "label3": "Receivable Platform",
//         "label4": "Paying Company",
//         "label5": "Report Period",
//         "label6": "Entry Time",
//         "label7": "Payment Date",
//         "label8": "Paying Company",
//         "label9": "Entry Time",
//         "label10": "Payment Date",
//         "label11": "Paying Company",
//         "label12": "Total Received",
//         "label13": "Receipt Rate",
//         "label14": "Original Report Amount",
//         "type": "Type"
//       },
//       "status": {
//         "notMatch": "Not Matched",
//         "auditWaiting": "Awaiting Review",
//         "received": "Received"
//       },
//       "tips": {
//         "text1": "The amount difference is too large, please check the data",
//         "text2": "No matching receipt data available",
//         "text3": "Matched",
//         "text4": "Difference",
//         "text5": "Modifying the match will cancel the previous matching result. Do you want to continue?"
//       },
//       "total": "Total {total} items"
//     }
//   }
// }

function flattenJson(json, parentKey = '', result = []) {
    for (let key in json) {
      if (Object.prototype.hasOwnProperty.call(json, key)) {
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        if (Array.isArray(json[key])) {
          json[key].forEach((item, index) => {
            const arrayKey = `${newKey}.${index}`;
            const bracketKey = `${newKey}[${index}]`;
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              flattenJson(item, arrayKey, result);
              flattenJson(item, bracketKey, result);
            } else if (item !== undefined) { // 检查值是否为 undefined
              result.push({ key: arrayKey, value: item });
              result.push({ key: bracketKey, value: item });
            }
          });
        } else if (typeof json[key] === 'object' && json[key] !== null && !Array.isArray(json[key])) {
          flattenJson(json[key], newKey, result);
        } else if (json[key] !== undefined) { // 检查值是否为 undefined
          result.push({ key: newKey, value: json[key] });
        }
      }
    }
    return result;
  }

  export default flattenJson;

  // console.log(flattenJson(json));
