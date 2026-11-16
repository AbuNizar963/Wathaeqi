import 'package:appwrite/appwrite.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'appwrite_service.dart';

const navy = Color(0xFF132B46);
const blue = Color(0xFF236DA9);

class WathaeqiMobileApp extends StatelessWidget {
  const WathaeqiMobileApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'وثائقي',
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Cairo',
      colorScheme: ColorScheme.fromSeed(seedColor: blue, surface: Colors.white),
      scaffoldBackgroundColor: const Color(0xFFF5F7FA),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: navy,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE3E9EF)),
        ),
      ),
    ),
    home: const AuthGate(),
  );
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late Future<dynamic> session;
  @override
  void initState() {
    super.initState();
    session = WathaeqiService.instance.currentUser();
  }

  void refresh() =>
      setState(() => session = WathaeqiService.instance.currentUser());
  @override
  Widget build(BuildContext context) => FutureBuilder<dynamic>(
    future: session,
    builder: (context, state) {
      if (state.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      return state.data == null
          ? SignInScreen(onSignedIn: refresh)
          : WorkspaceScreen(onSignedOut: refresh);
    },
  );
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.onSignedIn});
  final VoidCallback onSignedIn;
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController();
  bool signup = false, busy = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (signup) {
        await WathaeqiService.instance.signUp(
          name.text,
          email.text,
          password.text,
        );
      } else {
        await WathaeqiService.instance.signIn(email.text, password.text);
      }
      widget.onSignedIn();
    } on AppwriteException catch (e) {
      setState(() => error = e.message ?? 'تعذر تسجيل الدخول.');
    } catch (_) {
      setState(() => error = 'تعذر الاتصال بخدمة الوثائق. تحقق من الإنترنت.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          color: blue,
                          borderRadius: BorderRadius.circular(17),
                        ),
                        child: const Icon(
                          Icons.description_outlined,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'وثائقي',
                        style: TextStyle(
                          fontSize: 27,
                          fontWeight: FontWeight.w900,
                          color: navy,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        signup
                            ? 'أنشئ حسابك لإدارة مستنداتك'
                            : 'سجّل الدخول للوصول إلى وثائقك',
                        style: const TextStyle(color: Colors.black54),
                      ),
                      const SizedBox(height: 24),
                      if (signup) ...[
                        const Text('الاسم'),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: name,
                          decoration: const InputDecoration(
                            hintText: 'الاسم الكامل',
                          ),
                          validator: (v) => v == null || v.trim().isEmpty
                              ? 'أدخل الاسم'
                              : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                      const Text('البريد الإلكتروني'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          hintText: 'name@example.com',
                        ),
                        validator: (v) => v == null || !v.contains('@')
                            ? 'أدخل بريداً صحيحاً'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      const Text('كلمة المرور'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          hintText: '8 أحرف على الأقل',
                        ),
                        validator: (v) => v == null || v.length < 8
                            ? 'كلمة المرور 8 أحرف على الأقل'
                            : null,
                      ),
                      if (error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            error!,
                            style: const TextStyle(color: Colors.red),
                          ),
                        ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: busy ? null : submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: blue,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                        ),
                        child: busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(signup ? 'إنشاء الحساب' : 'تسجيل الدخول'),
                      ),
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => setState(() {
                                signup = !signup;
                                error = null;
                              }),
                        child: Text(
                          signup
                              ? 'لديك حساب؟ تسجيل الدخول'
                              : 'ليس لديك حساب؟ إنشاء حساب',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class WorkspaceScreen extends StatefulWidget {
  const WorkspaceScreen({super.key, required this.onSignedOut});
  final VoidCallback onSignedOut;
  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  int tab = 0;
  Future<void> signOut() async {
    try {
      await WathaeqiService.instance.signOut();
    } finally {
      widget.onSignedOut();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('وثائقي', style: TextStyle(fontWeight: FontWeight.w900)),
          Text(
            'إدارة الوثائق الرسمية',
            style: TextStyle(fontSize: 11, color: Colors.black54),
          ),
        ],
      ),
      actions: [
        PopupMenuButton<String>(
          onSelected: (v) {
            if (v == 'logout') signOut();
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'logout', child: Text('تسجيل الخروج')),
          ],
        ),
      ],
    ),
    body: IndexedStack(
      index: tab,
      children: const [DocumentsTab(), TemplatesTab(), ContactsTab()],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: tab,
      onDestinationSelected: (v) => setState(() => tab = v),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.description_outlined),
          label: 'المستندات',
        ),
        NavigationDestination(
          icon: Icon(Icons.bookmark_outline),
          label: 'القوالب',
        ),
        NavigationDestination(
          icon: Icon(Icons.contacts_outlined),
          label: 'جهات الاتصال',
        ),
      ],
    ),
  );
}

class DocumentsTab extends StatefulWidget {
  const DocumentsTab({super.key});
  @override
  State<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<DocumentsTab> {
  late Future<List<WathaeqiDocument>> items;
  String query = '';
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() =>
      setState(() => items = WathaeqiService.instance.listDocuments());
  Future<void> openEditor([WathaeqiDocument? item]) async {
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => DocumentEditorScreen(document: item)),
    );
    if (saved == true) reload();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<WathaeqiDocument>>(
    future: items,
    builder: (context, state) {
      final all = state.data ?? <WathaeqiDocument>[];
      final filtered = all
          .where((d) => d.title.toLowerCase().contains(query.toLowerCase()))
          .toList();
      return Stack(
        children: [
          RefreshIndicator(
            onRefresh: () async => reload(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 100),
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'مستنداتي',
                        style: TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                          color: navy,
                        ),
                      ),
                    ),
                    Text(
                      '${all.length} مستند',
                      style: const TextStyle(color: Colors.black54),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'ابحث في المستندات',
                  ),
                  onChanged: (v) => setState(() => query = v),
                ),
                const SizedBox(height: 14),
                if (state.connectionState != ConnectionState.done)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (state.hasError)
                  ErrorPanel(
                    message: 'تعذر تحميل المستندات: ${state.error}',
                    retry: reload,
                  )
                else if (filtered.isEmpty)
                  const EmptyPanel(
                    icon: Icons.description_outlined,
                    title: 'لا توجد مستندات بعد',
                    subtitle: 'أنشئ كتابك الرسمي الأول وابدأ بتنظيم وثائقك.',
                  )
                else
                  ...filtered.map(
                    (item) => Card(
                      child: ListTile(
                        leading: Container(
                          width: 42,
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF3FC),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.description_outlined,
                            color: blue,
                          ),
                        ),
                        title: Text(
                          item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: Text(
                          '${item.category} · ${dateLabel(item.updatedAt)}',
                        ),
                        trailing: const Icon(Icons.chevron_left),
                        onTap: () => openEditor(item),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Positioned(
            left: 18,
            bottom: 18,
            child: FloatingActionButton.extended(
              onPressed: () => openEditor(),
              backgroundColor: blue,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('مستند جديد'),
            ),
          ),
        ],
      );
    },
  );
}

class DocumentEditorScreen extends StatefulWidget {
  const DocumentEditorScreen({super.key, this.document});
  final WathaeqiDocument? document;
  @override
  State<DocumentEditorScreen> createState() => _DocumentEditorScreenState();
}

class _DocumentEditorScreenState extends State<DocumentEditorScreen> {
  late final title = TextEditingController(
    text: widget.document?.title ?? 'كتاب رسمي جديد',
  );
  late final category = TextEditingController(
    text: widget.document?.category ?? 'كتاب رسمي',
  );
  late final content = TextEditingController(
    text: widget.document?.content ?? 'بسم الله الرحمن الرحيم\n\nالعدد: ....................\nالتاريخ: .... / .... / ........\n\nإلى / ........................................\n\nالموضوع / ....................................\n\nتحية طيبة...\n\nيرجى التفضل بالاطلاع واتخاذ ما يلزم بشأن الموضوع أعلاه، مع التقدير.\n\nوتفضلوا بقبول فائق الاحترام.\n\nالتوقيع: ............................',
  );
  bool busy = false;
  String? error;
  String? documentId;
  late Future<List<Map<String, dynamic>>> attachments;

  @override
  void initState() {
    super.initState();
    documentId = widget.document?.id;
    attachments = documentId == null
        ? Future.value(<Map<String, dynamic>>[])
        : WathaeqiService.instance.listAttachments(documentId!);
  }

  void reloadAttachments() {
    final id = documentId;
    if (id == null) return;
    setState(() => attachments = WathaeqiService.instance.listAttachments(id));
  }

  String attachmentMimeType(String fileName) {
    final extension = fileName.split('.').last.toLowerCase();
    return switch (extension) {
      'pdf' => 'application/pdf',
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'webp' => 'image/webp',
      'doc' => 'application/msword',
      'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      _ => 'application/octet-stream',
    };
  }

  Future<void> pickAttachment() async {
    if (documentId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('احفظ المستند أولاً ثم أرفق الملفات.')),
      );
      return;
    }
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx'],
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.single;
      if (file.size > 10 * 1024 * 1024) {
        throw Exception('حجم الملف يتجاوز الحد المسموح وهو 10 ميغابايت.');
      }
      final path = file.path;
      if (path == null) {
        throw Exception('تعذر الوصول إلى مسار الملف المحدد.');
      }
      await WathaeqiService.instance.uploadAttachment(
        documentId: documentId!,
        path: path,
        fileName: file.name,
        mimeType: attachmentMimeType(file.name),
        size: file.size,
      );
      if (mounted) {
        reloadAttachments();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم إرفاق الملف بالمستند.')),
        );
      }
    } on AppwriteException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'تعذر رفع المرفق.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر إرفاق الملف: $e')),
        );
      }
    }
  }

  Future<void> removeAttachment(Map<String, dynamic> attachment) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('حذف المرفق'),
        content: Text('هل تريد حذف الملف «${attachment['fileName']}»؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await WathaeqiService.instance.deleteAttachment(attachment);
      if (mounted) reloadAttachments();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر حذف المرفق: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    title.dispose();
    category.dispose();
    content.dispose();
    super.dispose();
  }

  Future<void> applySavedTemplate() async {
    try {
      final templates = await WathaeqiService.instance.listTemplates();
      if (!mounted) return;
      if (templates.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('لا توجد قوالب محفوظة بعد.')),
        );
        return;
      }
      final selected = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('اختر قالباً'),
          children: templates
              .map(
                (item) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(context, item),
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.bookmark_outline, color: blue),
                    title: Text(item['title'].toString()),
                    subtitle: Text((item['category'] ?? '').toString()),
                  ),
                ),
              )
              .toList(),
        ),
      );
      if (selected == null || !mounted) return;
      setState(() {
        title.text = selected['title']?.toString() ?? title.text;
        category.text = selected['category']?.toString() ?? category.text;
        content.text = selected['content']?.toString() ?? '';
        error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'تعذر تحميل القوالب: $e');
    }
  }

  Future<void> save() async {
    if (title.text.trim().isEmpty) {
      setState(() => error = 'عنوان المستند مطلوب.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final saved = await WathaeqiService.instance.saveDocument(
        id: documentId,
        title: title.text,
        category: category.text,
        content: content.text,
      );
      if (mounted) {
        setState(() {
          documentId = saved.id;
          attachments = WathaeqiService.instance.listAttachments(saved.id);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حفظ المستند.')),
        );
      }
    } on AppwriteException catch (e) {
      setState(() => error = e.message ?? 'تعذر حفظ المستند.');
    } catch (_) {
      setState(() => error = 'تعذر حفظ المستند. تحقق من الاتصال.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> delete() async {
    final id = documentId;
    if (id == null) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('حذف المستند'),
        content: const Text('هل تريد حذف هذا المستند نهائياً؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await WathaeqiService.instance.deleteDocument(id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => error = 'تعذر حذف المستند: $e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.document == null ? 'مستند جديد' : 'تحرير المستند'),
      actions: [
        if (documentId != null)
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('تم'),
          ),
        if (documentId != null)
          IconButton(
            onPressed: delete,
            icon: const Icon(Icons.delete_outline, color: Colors.red),
          ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: title,
          decoration: const InputDecoration(labelText: 'عنوان المستند'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: category,
          decoration: const InputDecoration(labelText: 'التصنيف'),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: OutlinedButton.icon(
            onPressed: busy ? null : applySavedTemplate,
            icon: const Icon(Icons.bookmark_add_outlined),
            label: const Text('استخدام قالب محفوظ'),
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'محتوى المستند',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 16,
            color: navy,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: content,
          minLines: 15,
          maxLines: null,
          keyboardType: TextInputType.multiline,
          textDirection: TextDirection.rtl,
          textAlign: TextAlign.right,
          decoration: const InputDecoration(
            hintText: 'اكتب نص الكتاب الرسمي هنا...',
            alignLabelWithHint: true,
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: busy ? null : save,
          icon: busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.save_outlined),
          label: Text(busy ? 'جارٍ الحفظ...' : 'حفظ المستند'),
          style: FilledButton.styleFrom(
            backgroundColor: blue,
            padding: const EdgeInsets.symmetric(vertical: 15),
          ),
        ),
        const SizedBox(height: 22),
        Row(
          children: [
            const Expanded(
              child: Text(
                'المرفقات',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: navy,
                ),
              ),
            ),
            TextButton.icon(
              onPressed: pickAttachment,
              icon: const Icon(Icons.attach_file),
              label: const Text('إرفاق ملف'),
            ),
          ],
        ),
        if (documentId == null)
          const Text(
            'احفظ المستند أولاً لتتمكن من إرفاق الملفات.',
            style: TextStyle(color: Colors.black54),
          )
        else
          FutureBuilder<List<Map<String, dynamic>>>(
            future: attachments,
            builder: (context, state) {
              if (state.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.all(12),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (state.hasError) {
                return ErrorPanel(
                  message: 'تعذر تحميل المرفقات: ${state.error}',
                  retry: reloadAttachments,
                );
              }
              final files = state.data ?? [];
              if (files.isEmpty) {
                return const Text(
                  'لا توجد ملفات مرفقة بهذا المستند.',
                  style: TextStyle(color: Colors.black54),
                );
              }
              return Column(
                children: files.map((file) {
                  final size = (file['size'] as num?)?.toInt() ?? 0;
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.insert_drive_file_outlined, color: blue),
                      title: Text(
                        file['fileName'].toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text('${(size / 1024).toStringAsFixed(1)} KB'),
                      trailing: IconButton(
                        tooltip: 'حذف المرفق',
                        onPressed: () => removeAttachment(file),
                        icon: const Icon(Icons.delete_outline, color: Colors.red),
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        const SizedBox(height: 18),
        const Text(
          'معاينة سريعة',
          style: TextStyle(fontWeight: FontWeight.w900, color: navy),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xFFE1E7ED)),
          ),
          child: Column(
            children: [
              const Text(
                'وثائقي',
                style: TextStyle(fontWeight: FontWeight.w900, color: navy),
              ),
              const Divider(height: 24),
              Text(
                content.text,
                textAlign: TextAlign.right,
                textDirection: TextDirection.rtl,
                style: const TextStyle(height: 1.9),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class TemplatesTab extends StatefulWidget {
  const TemplatesTab({super.key});
  @override
  State<TemplatesTab> createState() => _TemplatesTabState();
}

class _TemplatesTabState extends State<TemplatesTab> {
  late Future<List<Map<String, dynamic>>> items;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() =>
      setState(() => items = WathaeqiService.instance.listTemplates());
  Future<void> editTemplate([Map<String, dynamic>? item]) async {
    final title = TextEditingController(text: item?['title']?.toString() ?? '');
    final category = TextEditingController(
      text: item?['category']?.toString() ?? 'كتاب رسمي',
    );
    final content = TextEditingController(
      text: item?['content']?.toString() ?? '',
    );
    final form = GlobalKey<FormState>();
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(item == null ? 'قالب جديد' : 'تعديل القالب'),
          content: Form(
            key: form,
            child: SizedBox(
              width: 420,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      controller: title,
                      decoration: const InputDecoration(
                        labelText: 'اسم القالب',
                      ),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'أدخل الاسم' : null,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: category,
                      decoration: const InputDecoration(labelText: 'التصنيف'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: content,
                      minLines: 4,
                      maxLines: 7,
                      decoration: const InputDecoration(
                        labelText: 'محتوى القالب',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(context, form.currentState!.validate()),
              child: const Text('حفظ'),
            ),
          ],
        ),
      );
      if (ok == true) {
        await WathaeqiService.instance.saveTemplate(
          id: item?['id']?.toString(),
          title: title.text,
          category: category.text,
          content: content.text,
        );
        if (mounted) reload();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('تعذر حفظ القالب: $e')));
      }
    } finally {
      title.dispose();
      category.dispose();
      content.dispose();
    }
  }

  Future<void> deleteTemplate(Map<String, dynamic> item) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('حذف القالب'),
        content: Text('هل تريد حذف القالب «${item['title']}»؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await WathaeqiService.instance.deleteTemplate(item['id'].toString());
      if (mounted) reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('تعذر حذف القالب: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<Map<String, dynamic>>>(
        future: items,
        builder: (context, state) => RefreshIndicator(
          onRefresh: () async => reload(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'القوالب الرسمية',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: navy,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => editTemplate(),
                    icon: const Icon(Icons.add_circle, color: blue, size: 30),
                  ),
                ],
              ),
              if (state.connectionState != ConnectionState.done)
                const Center(child: CircularProgressIndicator())
              else if (state.hasError)
                ErrorPanel(
                  message: 'تعذر تحميل القوالب: ${state.error}',
                  retry: reload,
                )
              else if ((state.data ?? []).isEmpty)
                const EmptyPanel(
                  icon: Icons.bookmark_outline,
                  title: 'لا توجد قوالب محفوظة',
                  subtitle: 'أضف قالباً لإعادة استخدامه في كتبك.',
                )
              else
                ...(state.data ?? []).map(
                  (item) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.bookmark_outline, color: blue),
                      title: Text(
                        item['title'].toString(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text((item['category'] ?? '').toString()),
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) {
                          if (action == 'edit') editTemplate(item);
                          if (action == 'delete') deleteTemplate(item);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'edit',
                            child: ListTile(
                              dense: true,
                              leading: Icon(Icons.edit_outlined),
                              title: Text('تعديل'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: ListTile(
                              dense: true,
                              leading: Icon(
                                Icons.delete_outline,
                                color: Colors.red,
                              ),
                              title: Text('حذف'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class ContactsTab extends StatefulWidget {
  const ContactsTab({super.key});
  @override
  State<ContactsTab> createState() => _ContactsTabState();
}

class _ContactsTabState extends State<ContactsTab> {
  late Future<List<Map<String, dynamic>>> items;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() =>
      setState(() => items = WathaeqiService.instance.listContacts());
  Future<void> editContact([Map<String, dynamic>? item]) async {
    final name = TextEditingController(text: item?['name']?.toString() ?? '');
    final email = TextEditingController(text: item?['email']?.toString() ?? '');
    final phone = TextEditingController(text: item?['phone']?.toString() ?? '');
    final organization = TextEditingController(
      text: item?['organization']?.toString() ?? '',
    );
    final form = GlobalKey<FormState>();
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(item == null ? 'جهة اتصال جديدة' : 'تعديل جهة الاتصال'),
          content: Form(
            key: form,
            child: SizedBox(
              width: 420,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      controller: name,
                      decoration: const InputDecoration(
                        labelText: 'الاسم أو الجهة',
                      ),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'الاسم مطلوب' : null,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: organization,
                      decoration: const InputDecoration(labelText: 'المؤسسة'),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'البريد الإلكتروني',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'الهاتف'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(context, form.currentState!.validate()),
              child: const Text('حفظ'),
            ),
          ],
        ),
      );
      if (ok == true) {
        await WathaeqiService.instance.saveContact(
          id: item?['id']?.toString(),
          name: name.text,
          email: email.text,
          phone: phone.text,
          organization: organization.text,
        );
        if (mounted) reload();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('تعذر حفظ جهة الاتصال: $e')));
      }
    } finally {
      name.dispose();
      email.dispose();
      phone.dispose();
      organization.dispose();
    }
  }

  Future<void> deleteContact(Map<String, dynamic> item) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('حذف جهة الاتصال'),
        content: Text('هل تريد حذف «${item['name']}»؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await WathaeqiService.instance.deleteContact(item['id'].toString());
      if (mounted) reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('تعذر حذف جهة الاتصال: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<Map<String, dynamic>>>(
        future: items,
        builder: (context, state) => RefreshIndicator(
          onRefresh: () async => reload(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'جهات الاتصال',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: navy,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => editContact(),
                    icon: const Icon(
                      Icons.person_add_alt_1,
                      color: blue,
                      size: 28,
                    ),
                  ),
                ],
              ),
              if (state.connectionState != ConnectionState.done)
                const Center(child: CircularProgressIndicator())
              else if (state.hasError)
                ErrorPanel(
                  message: 'تعذر تحميل جهات الاتصال: ${state.error}',
                  retry: reload,
                )
              else if ((state.data ?? []).isEmpty)
                const EmptyPanel(
                  icon: Icons.contacts_outlined,
                  title: 'لا توجد جهات اتصال',
                  subtitle: 'احفظ بيانات الجهات والأشخاص لتسهيل المراسلات.',
                )
              else
                ...(state.data ?? []).map(
                  (item) => Card(
                    child: ListTile(
                      leading: const CircleAvatar(
                        child: Icon(Icons.person_outline),
                      ),
                      title: Text(
                        item['name'].toString(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        [item['organization'], item['email'], item['phone']]
                            .where((v) => v != null && v.toString().isNotEmpty)
                            .join(' · '),
                      ),
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) {
                          if (action == 'edit') editContact(item);
                          if (action == 'delete') deleteContact(item);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'edit',
                            child: ListTile(
                              dense: true,
                              leading: Icon(Icons.edit_outlined),
                              title: Text('تعديل'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: ListTile(
                              dense: true,
                              leading: Icon(
                                Icons.delete_outline,
                                color: Colors.red,
                              ),
                              title: Text('حذف'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class EmptyPanel extends StatelessWidget {
  const EmptyPanel({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 55),
    child: Column(
      children: [
        Icon(icon, size: 44, color: Colors.black26),
        const SizedBox(height: 12),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 5),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.black54),
        ),
      ],
    ),
  );
}

class ErrorPanel extends StatelessWidget {
  const ErrorPanel({super.key, required this.message, required this.retry});
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Text(message, style: const TextStyle(color: Colors.red)),
          TextButton(onPressed: retry, child: const Text('إعادة المحاولة')),
        ],
      ),
    ),
  );
}

String dateLabel(String value) {
  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) return 'آخر تحديث';
  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
}
