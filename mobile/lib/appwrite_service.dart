import 'package:appwrite/appwrite.dart';

class WathaeqiDocument {
  const WathaeqiDocument({required this.id, required this.title, required this.category, required this.content, required this.updatedAt});
  final String id;
  final String title;
  final String category;
  final String content;
  final String updatedAt;

  factory WathaeqiDocument.fromRow(dynamic row) => WathaeqiDocument(
    id: row.$id as String,
    title: (row.data['title'] ?? '') as String,
    category: (row.data['category'] ?? '') as String,
    content: (row.data['content'] ?? '') as String,
    updatedAt: (row.data['updatedAt'] ?? row.$updatedAt) as String,
  );
}

class WathaeqiService {
  WathaeqiService._() {
    client.setEndpoint('https://fra.cloud.appwrite.io/v1').setProject('wathaeqi');
  }

  static final WathaeqiService instance = WathaeqiService._();
  final Client client = Client();
  late final Account account = Account(client);
  late final TablesDB tables = TablesDB(client);

  static const databaseId = 'wathaeqi-db';
  static const documentsTable = 'documents';
  static const templatesTable = 'templates';
  static const contactsTable = 'contacts';

  Future<dynamic> currentUser() async {
    try { return await account.get(); } on AppwriteException { return null; }
  }

  Future<dynamic> signIn(String email, String password) async {
    await account.createEmailPasswordSession(email: email.trim(), password: password);
    return account.get();
  }

  Future<dynamic> signUp(String name, String email, String password) async {
    await account.create(userId: ID.unique(), email: email.trim(), password: password, name: name.trim());
    await account.createEmailPasswordSession(email: email.trim(), password: password);
    return account.get();
  }

  Future<void> signOut() => account.deleteSession(sessionId: 'current');

  List<String> _privateRowPermissions(String userId) => [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];

  Future<List<WathaeqiDocument>> listDocuments() async {
    final user = await account.get();
    final result = await tables.listRows(
      databaseId: databaseId,
      tableId: documentsTable,
      queries: [Query.equal('ownerId', user.$id), Query.orderDesc('updatedAt'), Query.limit(100)],
    );
    return result.rows.map(WathaeqiDocument.fromRow).toList();
  }

  Future<WathaeqiDocument> saveDocument({String? id, required String title, required String category, required String content}) async {
    final user = await account.get();
    final data = {'title': title.trim(), 'category': category.trim(), 'content': content, 'updatedAt': DateTime.now().toUtc().toIso8601String()};
    final row = id == null
      ? await tables.createRow(databaseId: databaseId, tableId: documentsTable, rowId: ID.unique(), data: {'ownerId': user.$id, ...data}, permissions: _privateRowPermissions(user.$id))
      : await tables.updateRow(databaseId: databaseId, tableId: documentsTable, rowId: id, data: data);
    return WathaeqiDocument.fromRow(row);
  }

  Future<void> deleteDocument(String id) => tables.deleteRow(databaseId: databaseId, tableId: documentsTable, rowId: id);

  Future<List<Map<String, dynamic>>> listTemplates() async {
    final user = await account.get();
    final result = await tables.listRows(databaseId: databaseId, tableId: templatesTable, queries: [Query.equal('ownerId', user.$id), Query.orderDesc('$createdAt'), Query.limit(100)]);
    return result.rows.map((row) => {'id': row.$id, ...row.data}).toList();
  }

  Future<void> saveTemplate({String? id, required String title, required String category, required String content}) async {
    final user = await account.get();
    final data = {'title': title.trim(), 'category': category.trim(), 'content': content};
    if (id == null) {
      await tables.createRow(databaseId: databaseId, tableId: templatesTable, rowId: ID.unique(), data: {'ownerId': user.$id, ...data}, permissions: _privateRowPermissions(user.$id));
    } else {
      await tables.updateRow(databaseId: databaseId, tableId: templatesTable, rowId: id, data: data);
    }
  }

  Future<void> deleteTemplate(String id) => tables.deleteRow(databaseId: databaseId, tableId: templatesTable, rowId: id);

  Future<List<Map<String, dynamic>>> listContacts() async {
    final user = await account.get();
    final result = await tables.listRows(databaseId: databaseId, tableId: contactsTable, queries: [Query.equal('ownerId', user.$id), Query.orderDesc('$createdAt'), Query.limit(100)]);
    return result.rows.map((row) => {'id': row.$id, ...row.data}).toList();
  }

  Future<void> saveContact({String? id, required String name, required String email, required String phone, required String organization}) async {
    final user = await account.get();
    final data = {'name': name.trim(), 'email': email.trim(), 'phone': phone.trim(), 'organization': organization.trim()};
    if (id == null) {
      await tables.createRow(databaseId: databaseId, tableId: contactsTable, rowId: ID.unique(), data: {'ownerId': user.$id, ...data}, permissions: _privateRowPermissions(user.$id));
    } else {
      await tables.updateRow(databaseId: databaseId, tableId: contactsTable, rowId: id, data: data);
    }
  }

  Future<void> deleteContact(String id) => tables.deleteRow(databaseId: databaseId, tableId: contactsTable, rowId: id);
}
