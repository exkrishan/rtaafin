# Testing Guide: Hierarchical Disposition Taxonomy

This guide helps you test the complete hierarchical disposition taxonomy flow.

## 🎯 What to Test

1. **Parent Dispositions API** - Fetch all parent dispositions
2. **Sub-Dispositions API** - Fetch sub-dispositions for a parent
3. **Full Call Flow** - Transcript → Intent → KB → Disposition with IDs
4. **Auto-Selection** - Verify IDs are auto-selected correctly
5. **Save with IDs** - Verify disposition and sub-disposition IDs are saved

## 📋 Test Methods

### Method 1: Interactive Web UI

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Open test page:**
   ```
   http://localhost:3000/test-agent-assist
   ```

3. **Test Disposition APIs:**
   - Click "Test API" button for Parent Dispositions
   - Select a parent disposition from dropdown
   - Click "Test API" for Sub-Dispositions
   - Verify IDs are displayed correctly

4. **Test Full Flow:**
   - Use the transcript panel to send test messages
   - Click "Generate Summary" to test disposition mapping
   - Open disposition modal to verify auto-selection
   - Check browser console for IDs in API calls

### Method 2: Automated Script

Run the automated test script:

```bash
# Using tsx (recommended)
npx tsx scripts/test-disposition-taxonomy.ts

# Or using node with ts-node
npm run test:disposition
```

**Expected Output:**
```
🧪 Hierarchical Disposition Taxonomy Test
======================================================================
Base URL: http://localhost:3000
======================================================================

📋 Testing Parent Dispositions API...
   Found 8 parent dispositions
   Sample: Sale Completed (code: SALE_COMPLETED, id: 1)
   └─ Has 5 sub-dispositions
      Example: Follow-up on Order (id: 21)

📋 Testing Sub-Dispositions API...
   Testing with parent: Sale Completed (SALE_COMPLETED)
   Found 5 sub-dispositions for "SALE_COMPLETED"
   Sample: Follow-up on Order (code: follow_up, id: 21)

📞 Testing Full Call Flow...
   1️⃣  Sending transcript lines...
      ✅ "Hello, how can I help you today?..."
      ✅ "I noticed a fraudulent transaction..."
   2️⃣  Generating call summary...
      ✅ Summary generated
      📋 Suggested Disposition: Credit Card Fraud (code: CREDIT_CARD_FRAUD)
         ID: 3
         Score: 0.85
         Sub-Disposition: Fraud (ID: 25)
   3️⃣  Saving disposition with IDs...
      ✅ Disposition saved successfully
         Disposition ID: 3
         Sub-Disposition ID: 25

======================================================================
📊 Test Summary
======================================================================

✅ Passed: 8
⚠️  Warnings: 0
❌ Failed: 0

🎉 All tests passed!
```

### Method 3: Manual API Testing

**Test Parent Dispositions:**
```bash
curl http://localhost:3000/api/dispositions | jq
```

**Expected Response:**
```json
{
  "ok": true,
  "dispositions": [
    {
      "id": 1,
      "code": "SALE_COMPLETED",
      "title": "Sale Completed",
      "category": "sales",
      "sub_dispositions": [
        {
          "id": 21,
          "code": "follow_up",
          "label": "Follow-up on Order"
        }
      ]
    }
  ],
  "count": 8
}
```

**Test Sub-Dispositions:**
```bash
curl "http://localhost:3000/api/sub-dispositions?dispositionCode=SALE_COMPLETED" | jq
```

**Expected Response:**
```json
{
  "ok": true,
  "subDispositions": [
    {
      "id": 21,
      "code": "follow_up",
      "title": "Follow-up on Order",
      "label": "Follow-up on Order",
      "category": ""
    }
  ],
  "count": 5
}
```

## ✅ Test Checklist

### API Endpoints
- [ ] `/api/dispositions` returns parent dispositions with IDs
- [ ] `/api/dispositions` includes nested `sub_dispositions` array
- [ ] `/api/sub-dispositions?dispositionCode=X` returns children for parent
- [ ] `/api/sub-dispositions?dispositionId=X` works with ID parameter
- [ ] Sub-dispositions have correct `id`, `code`, `label` fields

### Frontend Components
- [ ] Disposition modal loads parent dispositions from API
- [ ] Sub-dispositions load when parent is selected
- [ ] IDs are tracked alongside codes
- [ ] Auto-selection works with IDs
- [ ] Dropdowns show correct labels and codes

### Full Flow
- [ ] Transcript ingestion works
- [ ] Intent detection triggers KB articles
- [ ] Summary generation includes disposition IDs
- [ ] Disposition modal auto-selects with IDs
- [ ] Saving includes both `dispositionId` and `subDispositionId`
- [ ] Database stores IDs correctly in `auto_notes` table

### Data Integrity
- [ ] Parent disposition IDs are valid (exist in `dispositions_master`)
- [ ] Sub-disposition IDs reference correct parent
- [ ] Codes match between parent and child
- [ ] No orphaned sub-dispositions (all have valid parent)

## 🐛 Troubleshooting

### Issue: No parent dispositions returned
**Check:**
- Database view `disposition_taxonomy` exists
- Table `dispositions_master` has data
- Supabase connection is working

**Fix:**
```sql
SELECT * FROM disposition_taxonomy LIMIT 5;
```

### Issue: Sub-dispositions not loading
**Check:**
- Parent code is correct
- `parent_disposition_id` column exists in `dispositions_master`
- API endpoint receives correct query parameter

**Fix:**
```sql
SELECT * FROM dispositions_master 
WHERE parent_disposition_id = (SELECT id FROM dispositions_master WHERE code = 'SALE_COMPLETED');
```

### Issue: IDs are null in responses
**Check:**
- `parent_id` column exists in `disposition_taxonomy` view
- API mapping includes ID fields
- Database has ID values

**Fix:**
Verify view definition includes `parent_id`:
```sql
SELECT parent_id, parent_code, parent_label FROM disposition_taxonomy LIMIT 1;
```

## 📊 Success Criteria

✅ All API endpoints return correct hierarchical structure  
✅ IDs are included in all API responses  
✅ Frontend components handle IDs correctly  
✅ Full call flow saves both codes and IDs  
✅ Auto-selection works with IDs  
✅ Database stores IDs in `auto_notes` table  

## 🎉 Next Steps

After successful testing:
1. Verify data in `auto_notes` table has `disposition_id` and `sub_disposition_id`
2. Test with different disposition combinations
3. Verify analytics can query by IDs
4. Test multi-tenant scenarios (if applicable)

---

**Happy Testing! 🚀**

