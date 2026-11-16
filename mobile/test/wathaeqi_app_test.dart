import 'package:flutter_test/flutter_test.dart';
import 'package:wathaeqi_mobile/appwrite_service.dart';

void main() {
  test('uses the Wathaeqi Appwrite database and document table', () {
    expect(WathaeqiService.databaseId, 'wathaeqi-db');
    expect(WathaeqiService.documentsTable, 'documents');
    expect(WathaeqiService.templatesTable, 'templates');
    expect(WathaeqiService.contactsTable, 'contacts');
  });
}
