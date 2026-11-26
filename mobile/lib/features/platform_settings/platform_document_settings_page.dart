import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../api.dart';
import '../admin/admin_page_intro.dart';
import '../../app_theme.dart';
import '../organizations/organization_logo_upload.dart';
import '../organizations/organization_logo_preview.dart';
import '../notifications/toast.dart';

String _settingsErrorMessage(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
      ),
    ),
  );
}

class PlatformDocumentSettingsPage extends StatefulWidget {
  const PlatformDocumentSettingsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<PlatformDocumentSettingsPage> createState() =>
      _PlatformDocumentSettingsPageState();
}

class _PlatformDocumentSettingsPageState
    extends State<PlatformDocumentSettingsPage> {
  static const _defaultColor = '#b49a55';
  static const _colorOptions = <String>[
    '#17365D',
    '#2457A6',
    '#168AAD',
    '#2A7F62',
    '#5B8C3A',
    '#B49A55',
    '#A66A24',
    '#9B4A42',
    '#8B3A62',
    '#684A8E',
    '#5D6775',
    '#202833',
  ];
  static const _fontFamilies = <String>[
    'Amiri',
    'IBM Plex Sans Arabic',
    'Cairo',
    'Arial',
    'Tahoma',
    'Traditional Arabic',
    'Times New Roman',
  ];
  static const _fontWeights = <int>[400, 500, 600, 700, 800];
  static const _dateFormatLabels = <String, String>{
    'yyyy/MM/dd': '2026/11/25 — سنة/شهر/يوم',
    'dd/MM/yyyy': '25/11/2026 — يوم/شهر/سنة',
    'MM/dd/yyyy': '11/25/2026 — شهر/يوم/سنة',
    'yyyy-MM-dd': '2026-11-25 — سنة-شهر-يوم',
    'dd-MM-yyyy': '25-11-2026 — يوم-شهر-سنة',
    'MM-dd-yyyy': '11-25-2026 — شهر-يوم-سنة',
    'yyyy.MM.dd': '2026.11.25 — سنة.شهر.يوم',
    'dd.MM.yyyy': '25.11.2026 — يوم.شهر.سنة',
    'd MMMM yyyy': '25 نوفمبر 2026 — شهر مكتوب',
    'MMMM d, yyyy': 'نوفمبر 25, 2026 — شهر مكتوب أولاً',
  };

  bool _loading = true;
  bool _saving = false;
  bool _settingsConfirmed = false;
  bool _showMinistryWatermarkText = true;
  bool _showVerificationQr = true;
  List<Map<String, String>> _pageHeaderRows = [];
  List<Map<String, String>> _pageFooterRows = [];
  double _watermarkOpacityPercent = 12;
  double _watermarkScalePercent = 100;
  String _headerDividerColor = _defaultColor;
  String _headerDividerStyle = 'double';
  String _frameStyle = 'single';
  String _frameColor = _defaultColor;
  double _headerDividerWidthPt = 2.25;
  double _frameWidthPt = 1;
  String _documentDateFormat = 'yyyy/MM/dd';
  String _documentFontFamily = 'Amiri';
  double _documentFontSizePt = 12;
  int _documentFontWeight = 400;
  String _documentFontColor = '#0f172a';
  String _recipientFontFamily = 'Amiri';
  double _recipientFontSizePt = 12;
  int _recipientFontWeight = 600;
  String _recipientFontColor = '#0f172a';
  double _marginTopMm = 10;
  double _marginRightMm = 10;
  double _marginBottomMm = 10;
  double _marginLeftMm = 10;
  String? _error;
  String? _organizationError;
  List<Map<String, dynamic>> _organizations = [];
  String? _selectedOrganizationId;
  String _organizationLogoUrl = '';
  Uint8List? _organizationLogoPreviewBytes;
  bool _loadingOrganizationSettings = true;
  bool _uploadingOrganizationLogo = false;
  final TextEditingController _colorController = TextEditingController(
    text: _defaultColor,
  );
  final TextEditingController _frameColorController = TextEditingController(
    text: _defaultColor,
  );
  final TextEditingController _documentFontColorController =
      TextEditingController(text: '#0f172a');
  final TextEditingController _recipientFontColorController =
      TextEditingController(text: '#0f172a');

  @override
  void initState() {
    super.initState();
    _load();
    _loadOrganizationLogoSettings();
  }

  @override
  void dispose() {
    _colorController.dispose();
    _frameColorController.dispose();
    _documentFontColorController.dispose();
    _recipientFontColorController.dispose();
    super.dispose();
  }

  Color _parseColor(String value) {
    final normalized = value.replaceFirst('#', '');
    final parsed = int.tryParse(normalized, radix: 16);
    return Color(0xFF000000 | (parsed ?? 0xB49A55));
  }

  bool _hasValidSettingsContract(Map result) {
    final opacity = result['watermarkOpacityPercent'];
    final color = result['headerDividerColor'];
    final scale = result['watermarkScalePercent'];
    final documentDateFormat = result['documentDateFormat'];
    final documentFontSize = result['documentFontSizePt'];
    final recipientFontSize = result['recipientFontSizePt'];
    final documentFontWeight = result['documentFontWeight'];
    final recipientFontWeight = result['recipientFontWeight'];
    final documentFontColor = result['documentFontColor'];
    final recipientFontColor = result['recipientFontColor'];
    return (scale == null || (scale is int && scale >= 40 && scale <= 180)) &&
        result['showMinistryWatermarkText'] is bool &&
        result['showVerificationQr'] is bool &&
        opacity is int &&
        opacity >= 0 &&
        opacity <= 60 &&
        color is String &&
        RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color) &&
        documentDateFormat is String &&
        _dateFormatLabels.containsKey(documentDateFormat) &&
        _fontFamilies.contains(result['documentFontFamily']) &&
        _fontFamilies.contains(result['recipientFontFamily']) &&
        documentFontSize is num &&
        documentFontSize >= 9 &&
        documentFontSize <= 24 &&
        recipientFontSize is num &&
        recipientFontSize >= 9 &&
        recipientFontSize <= 24 &&
        documentFontWeight is int &&
        _fontWeights.contains(documentFontWeight) &&
        recipientFontWeight is int &&
        _fontWeights.contains(recipientFontWeight) &&
        documentFontColor is String &&
        RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(documentFontColor) &&
        recipientFontColor is String &&
        RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(recipientFontColor);
  }

  List<Map<String, String>> _readTextRows(Object? value) {
    if (value is! List) return [];
    return value.take(12).map((item) {
      final row = item is Map ? item : const {};
      return <String, String>{
        'right': row['right']?.toString() ?? '',
        'left': row['left']?.toString() ?? '',
      };
    }).toList();
  }

  void _resizeRows(bool header, int count) {
    final current = header ? _pageHeaderRows : _pageFooterRows;
    final next = List.generate(
      count,
      (index) => index < current.length
          ? Map<String, String>.from(current[index])
          : <String, String>{'right': '', 'left': ''},
    );
    setState(() => header ? _pageHeaderRows = next : _pageFooterRows = next);
  }

  Widget _buildTextRowsEditor(String title, bool header) {
    final rows = header ? _pageHeaderRows : _pageFooterRows;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            SizedBox(
              width: 120,
              child: DropdownButtonFormField<int>(
                isExpanded: true,
                initialValue: rows.length,
                decoration: const InputDecoration(labelText: 'عدد السطور'),
                items: List.generate(
                  13,
                  (count) =>
                      DropdownMenuItem(value: count, child: Text('$count سطر')),
                ),
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value != null) _resizeRows(header, value);
                      },
              ),
            ),
          ],
        ),
        for (var index = 0; index < rows.length; index++)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextFormField(
                    key: ValueKey('${header ? 'h' : 'f'}-r-$index'),
                    initialValue: rows[index]['right'],
                    enabled: !_saving,
                    decoration: InputDecoration(
                      labelText: 'السطر ${index + 1} — يمين',
                    ),
                    onChanged: (value) =>
                        setState(() => rows[index]['right'] = value),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    key: ValueKey('${header ? 'h' : 'f'}-l-$index'),
                    initialValue: rows[index]['left'],
                    enabled: !_saving,
                    textDirection: TextDirection.ltr,
                    decoration: InputDecoration(
                      labelText: 'السطر ${index + 1} — يسار',
                    ),
                    onChanged: (value) =>
                        setState(() => rows[index]['left'] = value),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _settingsConfirmed = false;
    });
    try {
      final result = await widget.api.call(
        'platformDocumentSettings.get',
        allowOfflineCache: false,
      );
      if (result is! Map || !_hasValidSettingsContract(result)) {
        throw Exception('تعذر قراءة إعدادات النظام.');
      }
      final opacity = result['watermarkOpacityPercent'] as int;
      final color = result['headerDividerColor'] as String;
      if (!mounted) return;
      setState(() {
        _showMinistryWatermarkText =
            result['showMinistryWatermarkText'] as bool;
        _showVerificationQr = result['showVerificationQr'] as bool;
        _pageHeaderRows = _readTextRows(result['pageHeaderRows']);
        _pageFooterRows = _readTextRows(result['pageFooterRows']);
        _watermarkOpacityPercent = opacity.toDouble();
        _watermarkScalePercent =
            ((result['watermarkScalePercent'] as num?) ?? 100)
                .toDouble()
                .clamp(40.0, 180.0)
                .toDouble();
        _headerDividerColor = color.toLowerCase();
        _headerDividerStyle =
            result['headerDividerStyle']?.toString() ?? 'double';
        _headerDividerWidthPt = (result['headerDividerWidthPt'] as num? ?? 2.25)
            .toDouble();
        _frameStyle = result['frameStyle']?.toString() ?? 'single';
        _frameColor = result['frameColor']?.toString() ?? _defaultColor;
        _frameColorController.text = _frameColor;
        _frameWidthPt = (result['frameWidthPt'] as num? ?? 1).toDouble();
        _documentDateFormat =
            result['documentDateFormat']?.toString() ?? 'yyyy/MM/dd';
        _documentFontFamily =
            result['documentFontFamily']?.toString() ?? 'Amiri';
        _documentFontSizePt =
            (result['documentFontSizePt'] as num? ?? 12).toDouble();
        _documentFontWeight =
            (result['documentFontWeight'] as num? ?? 400).toInt();
        _documentFontColor =
            result['documentFontColor']?.toString() ?? '#0f172a';
        _documentFontColorController.text = _documentFontColor;
        _recipientFontFamily =
            result['recipientFontFamily']?.toString() ?? 'Amiri';
        _recipientFontSizePt =
            (result['recipientFontSizePt'] as num? ?? 12).toDouble();
        _recipientFontWeight =
            (result['recipientFontWeight'] as num? ?? 600).toInt();
        _recipientFontColor =
            result['recipientFontColor']?.toString() ?? '#0f172a';
        _recipientFontColorController.text = _recipientFontColor;
        _marginTopMm = (result['pageMarginTopMm'] as num? ?? 10).toDouble();
        _marginRightMm = (result['pageMarginRightMm'] as num? ?? 10).toDouble();
        _marginBottomMm = (result['pageMarginBottomMm'] as num? ?? 10)
            .toDouble();
        _marginLeftMm = (result['pageMarginLeftMm'] as num? ?? 10).toDouble();
        _colorController.text = _headerDividerColor;
        _settingsConfirmed = true;
      });
    } catch (exception) {
      if (mounted) {
        setState(() {
          _settingsConfirmed = false;
          _error = _settingsErrorMessage(exception);
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadOrganizationLogoSettings() async {
    setState(() {
      _loadingOrganizationSettings = true;
      _organizationError = null;
    });
    try {
      final results = await Future.wait([
        widget.api.call('organizations.all', allowOfflineCache: false),
        widget.api.call('organizations.context', allowOfflineCache: false),
      ]);
      final organizations = (results[0] is List ? results[0] as List : const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      final contextData = results[1];
      final currentId = contextData is Map
          ? contextData['organizationId']?.toString()
          : null;
      final selected =
          organizations.where((item) {
            return item['id']?.toString() == currentId;
          }).firstOrNull ??
          (organizations.isNotEmpty ? organizations.first : null);
      if (!mounted) return;
      setState(() {
        _organizations = organizations;
        _selectedOrganizationId = selected?['id']?.toString();
      });
      if (_selectedOrganizationId != null) {
        await _loadSelectedOrganizationSettings(_selectedOrganizationId!);
      } else {
        setState(() {
          _loadingOrganizationSettings = false;
          _organizationError = 'لا توجد جهة متاحة لربط شعار الوثيقة بها.';
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          _loadingOrganizationSettings = false;
          _organizationError = _settingsErrorMessage(exception);
        });
      }
    }
  }

  Future<void> _loadSelectedOrganizationSettings(String organizationId) async {
    setState(() {
      _loadingOrganizationSettings = true;
      _organizationError = null;
    });
    try {
      final result = await widget.api.call(
        'organizations.logo',
        input: {'id': organizationId, 'includeDataUrl': false},
        allowOfflineCache: false,
      );
      if (result is! Map) {
        throw Exception('تعذر قراءة شعار الجهة.');
      }
      final logoUrl = result['logoUrl']?.toString() ?? '';
      if (!mounted) return;
      setState(() {
        _organizationLogoUrl = logoUrl;
        _organizationLogoPreviewBytes = null;
        _loadingOrganizationSettings = false;
      });
      if (logoUrl.isNotEmpty) {
        final bytes = await widget.api.fetchOrganizationLogo(
          organizationId: organizationId,
          source: logoUrl,
        );
        if (!mounted || _selectedOrganizationId != organizationId) return;
        setState(() => _organizationLogoPreviewBytes = bytes);
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          _loadingOrganizationSettings = false;
          _organizationError = _settingsErrorMessage(exception);
        });
      }
    }
  }

  Future<void> _selectOrganization(String? organizationId) async {
    if (organizationId == null || organizationId == _selectedOrganizationId) {
      return;
    }
    setState(() => _selectedOrganizationId = organizationId);
    await _loadSelectedOrganizationSettings(organizationId);
  }

  Future<void> _pickAndUploadOrganizationLogo() async {
    final organizationId = _selectedOrganizationId;
    if (organizationId == null || _uploadingOrganizationLogo) return;
    try {
      final selection = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['svg', 'png', 'jpg', 'jpeg'],
        withData: true,
        allowMultiple: false,
      );
      if (selection == null || selection.files.isEmpty) return;
      final file = selection.files.single;
      final sourceBytes = file.bytes;
      if (sourceBytes == null || sourceBytes.isEmpty) {
        throw Exception('تعذر قراءة الصورة المختارة من الجهاز.');
      }
      setState(() => _uploadingOrganizationLogo = true);
      final prepared = await prepareOrganizationLogo(
        source: sourceBytes,
        fileName: file.name,
      );
      final uploaded = await widget.api.uploadOrganizationLogo(
        organizationId: organizationId,
        fileName: prepared.fileName,
        contentType: prepared.contentType,
        bytes: prepared.bytes,
      );
      if (!mounted) return;
      final logoUrl = uploaded['url']?.toString() ?? '';
      setState(() {
        _organizationLogoUrl = logoUrl;
        _organizationLogoPreviewBytes = prepared.bytes;
      });
      Toast.success(
        context,
        logoUrl.isEmpty
            ? 'تم حفظ الشعار؛ المعاينة عن بُعد غير متاحة مؤقتاً.'
            : 'تم حفظ شعار الجهة وربطه بترويسة الوثائق',
      );
    } catch (exception) {
      if (mounted) {
        setState(() => _organizationError = _settingsErrorMessage(exception));
      }
    } finally {
      if (mounted) setState(() => _uploadingOrganizationLogo = false);
    }
  }

  Future<void> _save() async {
    if (!_settingsConfirmed) {
      setState(() => _error = 'حمّل إعدادات النظام من الخادم أولاً.');
      return;
    }
    final color = _colorController.text.trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color)) {
      setState(() => _error = 'أدخل لونًا صحيحًا بصيغة #RRGGBB.');
      return;
    }
    final documentFontColor = _documentFontColorController.text.trim();
    final recipientFontColor = _recipientFontColorController.text.trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(documentFontColor) ||
        !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(recipientFontColor)) {
      setState(() => _error = 'أدخل لون خط صحيحًا بصيغة #RRGGBB.');
      return;
    }
    setState(() {
      _documentFontColor = documentFontColor.toLowerCase();
      _recipientFontColor = recipientFontColor.toLowerCase();
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.api.call(
        'platformDocumentSettings.update',
        mutation: true,
        input: {
          'showMinistryWatermarkText': _showMinistryWatermarkText,
          'watermarkOpacityPercent': _watermarkOpacityPercent.round(),
          'watermarkScalePercent': _watermarkScalePercent.round(),
          'headerDividerColor': color.toLowerCase(),
          'headerDividerStyle': _headerDividerStyle,
          'headerDividerWidthPt': _headerDividerWidthPt,
          'pageMarginTopMm': _marginTopMm.round(),
          'pageMarginRightMm': _marginRightMm.round(),
          'pageMarginBottomMm': _marginBottomMm.round(),
          'pageMarginLeftMm': _marginLeftMm.round(),
          'frameStyle': _frameStyle,
          'frameColor': _frameColor,
          'frameWidthPt': _frameWidthPt,
          'documentDateFormat': _documentDateFormat,
          'documentFontFamily': _documentFontFamily,
          'documentFontSizePt': _documentFontSizePt,
          'documentFontWeight': _documentFontWeight,
          'documentFontColor': _documentFontColor,
          'recipientFontFamily': _recipientFontFamily,
          'recipientFontSizePt': _recipientFontSizePt,
          'recipientFontWeight': _recipientFontWeight,
          'recipientFontColor': _recipientFontColor,
          'showVerificationQr': _showVerificationQr,
          'pageHeaderRows': _pageHeaderRows,
          'pageFooterRows': _pageFooterRows,
        },
      );
      if (!mounted) return;
      if (result is! Map || !_hasValidSettingsContract(result)) {
        throw Exception('تعذر تأكيد حفظ إعدادات النظام.');
      }
      setState(() {
        _showMinistryWatermarkText =
            result['showMinistryWatermarkText'] as bool;
        _showVerificationQr = result['showVerificationQr'] as bool;
        _watermarkOpacityPercent = (result['watermarkOpacityPercent'] as int)
            .toDouble();
        _watermarkScalePercent =
            ((result['watermarkScalePercent'] as num?) ?? 100)
                .toDouble()
                .clamp(40.0, 180.0)
                .toDouble();
        _headerDividerColor = (result['headerDividerColor'] as String)
            .toLowerCase();
        _colorController.text = _headerDividerColor;
        _documentDateFormat =
            result['documentDateFormat']?.toString() ?? _documentDateFormat;
        _documentFontFamily =
            result['documentFontFamily']?.toString() ?? _documentFontFamily;
        _documentFontSizePt =
            (result['documentFontSizePt'] as num? ?? _documentFontSizePt)
                .toDouble();
        _documentFontWeight =
            (result['documentFontWeight'] as num? ?? _documentFontWeight)
                .toInt();
        _documentFontColor =
            result['documentFontColor']?.toString() ?? _documentFontColor;
        _documentFontColorController.text = _documentFontColor;
        _recipientFontFamily =
            result['recipientFontFamily']?.toString() ?? _recipientFontFamily;
        _recipientFontSizePt =
            (result['recipientFontSizePt'] as num? ?? _recipientFontSizePt)
                .toDouble();
        _recipientFontWeight =
            (result['recipientFontWeight'] as num? ?? _recipientFontWeight)
                .toInt();
        _recipientFontColor =
            result['recipientFontColor']?.toString() ?? _recipientFontColor;
        _recipientFontColorController.text = _recipientFontColor;
      });
      Toast.success(context, 'تم حفظ إعدادات وثائق النظام');
    } catch (exception) {
      if (mounted) setState(() => _error = _settingsErrorMessage(exception));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _settingsSlider(
    String label,
    double value,
    double min,
    double max,
    String suffix,
    ValueChanged<double> onChanged,
  ) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${value.toStringAsFixed(value.truncateToDouble() == value ? 0 : 2)}$suffix',
          ),
        ],
      ),
      Slider.adaptive(
        value: value.clamp(min, max),
        min: min,
        max: max,
        onChanged: _saving ? null : onChanged,
      ),
    ],
  );
  Widget _buildOrganizationLogoCard() {
    final colors = Theme.of(context).colorScheme;
    final selectedOrganization = _organizations.where((organization) {
      return organization['id']?.toString() == _selectedOrganizationId;
    }).firstOrNull;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'شعار الجهة في ترويسة الوثيقة',
              style: TextStyle(
                color: colors.onSurface,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'اختر الجهة ثم ارفع شعارها ليظهر في منتصف رأس الوثيقة الرسمية.',
              style: TextStyle(color: colors.onSurfaceVariant, height: 1.5),
            ),
            const SizedBox(height: 12),
            if (_loadingOrganizationSettings)
              const Center(child: CircularProgressIndicator())
            else if (_organizations.isEmpty)
              const Text('لا توجد جهات متاحة.')
            else ...[
              DropdownButtonFormField<String>(
                initialValue: _selectedOrganizationId,
                decoration: const InputDecoration(
                  labelText: 'الجهة',
                  border: OutlineInputBorder(),
                ),
                items: _organizations.map((organization) {
                  return DropdownMenuItem(
                    value: organization['id']?.toString(),
                    child: Text(
                      organization['name']?.toString() ?? 'جهة بدون اسم',
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                }).toList(),
                onChanged: _uploadingOrganizationLogo
                    ? null
                    : _selectOrganization,
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 92,
                    height: 92,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      border: Border.all(color: colors.outlineVariant),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: _organizationLogoPreviewBytes == null
                        ? Icon(
                            _organizationLogoUrl.isEmpty
                                ? Icons.image_outlined
                                : Icons.broken_image_outlined,
                            color: colors.onSurfaceVariant,
                          )
                        : OrganizationLogoPreview(
                            bytes: _organizationLogoPreviewBytes!,
                            width: 76,
                            height: 76,
                            fallback: Icon(
                              Icons.broken_image_outlined,
                              color: colors.onSurfaceVariant,
                            ),
                          ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FilledButton.icon(
                          onPressed:
                              _uploadingOrganizationLogo ||
                                  _selectedOrganizationId == null
                              ? null
                              : _pickAndUploadOrganizationLogo,
                          icon: _uploadingOrganizationLogo
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.upload_outlined),
                          label: Text(
                            _uploadingOrganizationLogo
                                ? 'جارٍ رفع الشعار...'
                                : 'اختيار ورفع الشعار',
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'SVG أو PNG أو JPG/JPEG، حتى 25 ميغابايت للمصدر و5 ميغابايت للناتج. يتم حفظ الملف في مساحة ملفات الجهة.',
                          style: TextStyle(
                            color: colors.onSurfaceVariant,
                            fontSize: 12,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
            if (_organizationError != null) ...[
              const SizedBox(height: 10),
              _ErrorCard(message: _organizationError!),
              TextButton.icon(
                onPressed: _loadingOrganizationSettings
                    ? null
                    : () {
                        final id = _selectedOrganizationId;
                        if (id != null) _loadSelectedOrganizationSettings(id);
                      },
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة تحميل إعدادات الجهة'),
              ),
            ],
            if (selectedOrganization != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'الشعار مرتبط بجهة: ${selectedOrganization['name'] ?? '—'}',
                  style: TextStyle(
                    color: colors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'إعدادات النظام',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : !_settingsConfirmed
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _ErrorCard(message: _error ?? 'تعذر قراءة إعدادات النظام.'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) _ErrorCard(message: _error!),
                const AdminPageIntro(
                  title: 'إعدادات الوثائق',
                  description: 'ضبط الهوية الرسمية والترويسة والعلامة المائية',
                  icon: Icons.tune_outlined,
                ),
                _buildOrganizationLogoCard(),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'هوية الوثيقة الرسمية',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onSurface,
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'تُطبّق هذه الإعدادات على الوثائق الرسمية الجديدة، ويستطيع مالك النظام وحده تعديلها.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _buildTextRowsEditor('سطور رأس الصفحة', true),
                        const SizedBox(height: 20),
                        _buildTextRowsEditor('سطور تذييل الصفحة', false),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _documentDateFormat,
                          decoration: const InputDecoration(
                            labelText: 'صيغة تاريخ الوثيقة',
                          ),
                          items: _dateFormatLabels.entries
                              .map(
                                (entry) => DropdownMenuItem(
                                  value: entry.key,
                                  child: Text(
                                    entry.value,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() => _documentDateFormat = value);
                                  }
                                },
                        ),
                        const Divider(height: 28),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'إظهار عبارة «وزارة الداخلية» كعلامة مائية',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: const Text(
                            'يتحكم بالعبارات المتكررة خلف المحتوى، ولا يغيّر الترويسة الرسمية.',
                          ),
                          value: _showMinistryWatermarkText,
                          onChanged: _saving
                              ? null
                              : (value) => setState(
                                  () => _showMinistryWatermarkText = value,
                                ),
                        ),
                        const Divider(height: 20),
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'شفافية العلامة المائية',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ),
                            Text(
                              '${_watermarkOpacityPercent.round()}%',
                              style: const TextStyle(
                                color: AppPalette.navy,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                        Slider.adaptive(
                          value: _watermarkOpacityPercent,
                          min: 0,
                          max: 60,
                          divisions: 60,
                          label: '${_watermarkOpacityPercent.round()}%',
                          onChanged: _saving
                              ? null
                              : (value) => setState(
                                  () => _watermarkOpacityPercent = value,
                                ),
                        ),
                        _settingsSlider(
                          'حجم العلامة المائية',
                          _watermarkScalePercent,
                          40,
                          180,
                          '%',
                          (value) =>
                              setState(() => _watermarkScalePercent = value),
                        ),
                        Text(
                          'يُطبّق الحجم على نص العلامة المائية وشعارها في المعاينة والطباعة. النطاق من 40% إلى 180%.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'لون الخط الفاصل في ترويسة الوثيقة',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: _colorOptions.map((color) {
                            final selected =
                                _headerDividerColor.toLowerCase() == color;
                            return Tooltip(
                              message: color.toUpperCase(),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _saving
                                    ? null
                                    : () => setState(() {
                                        _headerDividerColor = color;
                                        _colorController.text = color;
                                      }),
                                child: Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: _parseColor(color),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: selected
                                          ? Theme.of(context)
                                                .colorScheme
                                                .onSurface
                                          : Theme.of(context)
                                                .colorScheme
                                                .outline,
                                      width: selected ? 3 : 1,
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x22000000),
                                        blurRadius: 3,
                                      ),
                                    ],
                                  ),
                                  child: selected
                                      ? const Icon(
                                          Icons.check,
                                          color: Colors.white,
                                          size: 18,
                                        )
                                      : null,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _colorController,
                          enabled: !_saving,
                          textDirection: TextDirection.ltr,
                          decoration: InputDecoration(
                            labelText: 'رمز اللون المخصص',
                            hintText: '#2457A6',
                            prefixIcon: Icon(
                              Icons.palette_outlined,
                              color: _parseColor(_headerDividerColor),
                            ),
                            border: const OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
                              setState(
                                () => _headerDividerColor = value.toLowerCase(),
                              );
                            }
                          },
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'تنسيق الصفحة والإطار',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _frameStyle,
                          decoration: const InputDecoration(
                            labelText: 'شكل الإطار',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'none',
                              child: Text('بدون إطار'),
                            ),
                            DropdownMenuItem(
                              value: 'single',
                              child: Text('مفرد'),
                            ),
                            DropdownMenuItem(
                              value: 'double',
                              child: Text('مزدوج'),
                            ),
                            DropdownMenuItem(
                              value: 'ornate',
                              child: Text('زخرفي احترافي'),
                            ),
                          ],
                          onChanged: _saving
                              ? null
                              : (v) {
                                  if (v != null) {
                                    setState(() => _frameStyle = v);
                                  }
                                },
                        ),
                        TextField(
                          enabled: !_saving,
                          textDirection: TextDirection.ltr,
                          decoration: const InputDecoration(
                            labelText: 'لون الإطار #RRGGBB',
                          ),
                          controller: _frameColorController,
                          onChanged: (v) {
                            if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(v)) {
                              setState(() => _frameColor = v.toLowerCase());
                            }
                          },
                        ),
                        _settingsSlider(
                          'سماكة الإطار',
                          _frameWidthPt,
                          .5,
                          4,
                          ' نقطة',
                          (v) => setState(() => _frameWidthPt = v),
                        ),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _headerDividerStyle,
                          decoration: const InputDecoration(
                            labelText: 'نمط الفاصل بين الرأس والمحتوى',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'solid',
                              child: Text('متصل'),
                            ),
                            DropdownMenuItem(
                              value: 'double',
                              child: Text('مزدوج'),
                            ),
                            DropdownMenuItem(
                              value: 'dashed',
                              child: Text('متقطع'),
                            ),
                            DropdownMenuItem(
                              value: 'dotted',
                              child: Text('منقط'),
                            ),
                            DropdownMenuItem(
                              value: 'tricolor-stars',
                              child: Text(
                                'أسود وأخضر مع ثلاث نجوم',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                          onChanged: _saving
                              ? null
                              : (v) {
                                  if (v != null) {
                                    setState(() => _headerDividerStyle = v);
                                  }
                                },
                        ),
                        _settingsSlider(
                          'سماكة الفاصل',
                          _headerDividerWidthPt,
                          .5,
                          6,
                          ' نقطة',
                          (v) => setState(() => _headerDividerWidthPt = v),
                        ),
                        for (final item
                            in <
                              ({
                                String label,
                                double value,
                                void Function(double) onChanged,
                              })
                            >[
                              (
                                label: 'الهامش العلوي',
                                value: _marginTopMm,
                                onChanged: (v) =>
                                    setState(() => _marginTopMm = v),
                              ),
                              (
                                label: 'الهامش الأيمن',
                                value: _marginRightMm,
                                onChanged: (v) =>
                                    setState(() => _marginRightMm = v),
                              ),
                              (
                                label: 'الهامش السفلي',
                                value: _marginBottomMm,
                                onChanged: (v) =>
                                    setState(() => _marginBottomMm = v),
                              ),
                              (
                                label: 'الهامش الأيسر',
                                value: _marginLeftMm,
                                onChanged: (v) =>
                                    setState(() => _marginLeftMm = v),
                              ),
                            ])
                          _settingsSlider(
                            item.label,
                            item.value,
                            0,
                            35,
                            ' مم',
                            item.onChanged,
                          ),
                        const SizedBox(height: 16),
                        Text(
                          'الخط والجهة المستلمة',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        const SizedBox(height: 10),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _documentFontFamily,
                          decoration: const InputDecoration(
                            labelText: 'نوع خط الوثيقة',
                          ),
                          items: _fontFamilies
                              .map(
                                (family) => DropdownMenuItem(
                                  value: family,
                                  child: Text(family),
                                ),
                              )
                              .toList(),
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() => _documentFontFamily = value);
                                  }
                                },
                        ),
                        _settingsSlider(
                          'حجم خط الوثيقة',
                          _documentFontSizePt,
                          9,
                          24,
                          ' نقطة',
                          (value) =>
                              setState(() => _documentFontSizePt = value),
                        ),
                        DropdownButtonFormField<int>(
                          isExpanded: true,
                          initialValue: _documentFontWeight,
                          decoration: const InputDecoration(
                            labelText: 'سماكة خط الوثيقة',
                          ),
                          items: _fontWeights
                              .map(
                                (weight) => DropdownMenuItem(
                                  value: weight,
                                  child: Text('$weight'),
                                ),
                              )
                              .toList(),
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() => _documentFontWeight = value);
                                  }
                                },
                        ),
                        TextField(
                          controller: _documentFontColorController,
                          enabled: !_saving,
                          textDirection: TextDirection.ltr,
                          decoration: const InputDecoration(
                            labelText: 'لون خط الوثيقة #RRGGBB',
                          ),
                          onChanged: (value) {
                            if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
                              setState(
                                () => _documentFontColor = value.toLowerCase(),
                              );
                            }
                          },
                        ),
                        const Divider(height: 24),
                        DropdownButtonFormField<String>(
                          isExpanded: true,
                          initialValue: _recipientFontFamily,
                          decoration: const InputDecoration(
                            labelText: 'نوع خط الجهة المستلمة',
                          ),
                          items: _fontFamilies
                              .map(
                                (family) => DropdownMenuItem(
                                  value: family,
                                  child: Text(family),
                                ),
                              )
                              .toList(),
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() => _recipientFontFamily = value);
                                  }
                                },
                        ),
                        _settingsSlider(
                          'حجم خط الجهة المستلمة',
                          _recipientFontSizePt,
                          9,
                          24,
                          ' نقطة',
                          (value) =>
                              setState(() => _recipientFontSizePt = value),
                        ),
                        DropdownButtonFormField<int>(
                          isExpanded: true,
                          initialValue: _recipientFontWeight,
                          decoration: const InputDecoration(
                            labelText: 'سماكة خط الجهة المستلمة',
                          ),
                          items: _fontWeights
                              .map(
                                (weight) => DropdownMenuItem(
                                  value: weight,
                                  child: Text('$weight'),
                                ),
                              )
                              .toList(),
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() => _recipientFontWeight = value);
                                  }
                                },
                        ),
                        TextField(
                          controller: _recipientFontColorController,
                          enabled: !_saving,
                          textDirection: TextDirection.ltr,
                          decoration: const InputDecoration(
                            labelText: 'لون خط الجهة المستلمة #RRGGBB',
                          ),
                          onChanged: (value) {
                            if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
                              setState(
                                () => _recipientFontColor = value.toLowerCase(),
                              );
                            }
                          },
                        ),
                        const SizedBox(height: 8),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'إظهار QR للتحقق في الوثائق الرسمية',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: const Text(
                            'إخفاء الرمز المطبوع لا يعطّل صلاحية التحقق من الوثيقة.',
                          ),
                          value: _showVerificationQr,
                          onChanged: _saving
                              ? null
                              : (value) =>
                                    setState(() => _showVerificationQr = value),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _saving ? null : _save,
                          icon: const Icon(Icons.save_outlined),
                          label: Text(
                            _saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات النظام',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    ),
  );
}
