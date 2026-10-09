import 'package:flutter/material.dart';

import '../../core/theme/app_fields.dart';

/// The §6 field class an [AppFormField] paints. Only `.input` is measured, and
/// the enum exists so a second field shape has to be measured before anything
/// can ask for it.
enum AppFieldControl {
  input('.input');

  const AppFieldControl(this.cssClass);

  /// The key [AppFields] stores the measured row under.
  final String cssClass;
}

/// The §6 label class [AppFormField] puts above its field — `.eyebrow`, the
/// class `src/components/ui/Input.tsx` labels an `.input` with.
enum AppFieldLabel {
  eyebrow('.eyebrow');

  const AppFieldLabel(this.cssClass);

  /// The key [AppLabels] stores the measured row under.
  final String cssClass;
}

/// A text field of the design system, painted from the UI_SPEC §6 measurement of
/// `.input` and its authored `:focus` and `::placeholder` rules: no colour,
/// radius, border, size, weight, line height, tracking, padding or clock appears
/// here as a number.
///
/// What the web does, and what this does: the resting paint is the probe, focus
/// repaints the border with `--line-strong` and eases a `--glow` ring out of
/// nothing on the class's own `--dur-fast` / `--ease-out`, and the hint is
/// `--ink-3`. There is no `:hover` (D-U1) and there is no disabled state:
/// `.input` authors no `:disabled` rule, so there is nothing measured to paint,
/// and the generator fails if one appears.
///
/// The Material decorator is switched off rather than restyled — every one of its
/// borders is [InputBorder.none], `filled` is false and its `contentPadding` is
/// the measured shorthand — so the only paint on the field is [AppFieldSpec]'s.
/// `isDense` is what keeps Material's own minimum field height out of the box;
/// the widget test measures the height instead of trusting it.
///
/// The box is `display: block; width: 100%`: it is as wide as the caller gives
/// it, which needs a bounded width, exactly as a block does on the web.
///
/// Three things the row does not answer, left as the measurement rather than a
/// guess: the caret takes the text colour because CSS `caret-color: auto` means
/// exactly that and `.input` authors no `caret-color`; the selection highlight
/// stays the theme's, since `::selection` has no rule either; and the error and
/// helper lines `Input.tsx` composes at `text-[11px]` are Tailwind utilities no
/// §6 pass measured, so this field does not paint them.
///
/// The web's `<label for>` does two things: it names the input, and a tap on the
/// label focuses the field. [AppFormField] ports the second one; the first is out
/// of reach because Flutter's [Semantics] has no labelled-by relation, so the
/// label reaches a screen reader as the node that precedes the field in traversal
/// order — the way Material's own decorator label does. Putting the accessible name
/// on the editable node itself is a ruling, not a widget choice.
class AppFormField extends StatefulWidget {
  const AppFormField({
    required this.controller,
    super.key,
    this.label,
    this.control = AppFieldControl.input,
    this.labelControl = AppFieldLabel.eyebrow,
    this.hintText,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofocus = false,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;

  /// The visible label, painted from [labelControl]'s measured row. `null` is a
  /// field with no label — the wrapper still gives it the same width.
  final String? label;

  final AppFieldControl control;
  final AppFieldLabel labelControl;
  final String? hintText;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool autofocus;

  /// The node the field focuses through. The box paints `:focus` from whatever
  /// node it is given, and a node the caller owns is never disposed here.
  ///
  /// A tap outside the field does not clear that focus the way a web page blurs
  /// an input on an outside click: in Flutter that is the focus traversal the
  /// screen owns, alongside the router AppButton defers to for the same reason.
  final FocusNode? focusNode;

  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppFormField> createState() => _AppFormFieldState();
}

class _AppFormFieldState extends State<AppFormField> {
  late FocusNode _focusNode;
  bool _ownsFocusNode = false;
  late bool _focused;

  @override
  void initState() {
    super.initState();
    _bindFocusNode();
    _focused = _focusNode.hasFocus;
  }

  @override
  void didUpdateWidget(AppFormField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (identical(oldWidget.focusNode, widget.focusNode)) return;
    _unbindFocusNode();
    _bindFocusNode();
    setState(() => _focused = _focusNode.hasFocus);
  }

  void _bindFocusNode() {
    _focusNode = widget.focusNode ?? FocusNode();
    _ownsFocusNode = widget.focusNode == null;
    _focusNode.addListener(_onFocusChange);
  }

  void _unbindFocusNode() {
    _focusNode.removeListener(_onFocusChange);
    if (_ownsFocusNode) _focusNode.dispose();
  }

  void _onFocusChange() => setState(() => _focused = _focusNode.hasFocus);

  @override
  void dispose() {
    _unbindFocusNode();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final AppFieldSpec spec = AppFields.resolve(
      widget.control.cssClass,
      brightness,
    );
    final String? label = widget.label;
    final AppLabelSpec? labelSpec = label == null
        ? null
        : AppLabels.resolve(widget.labelControl.cssClass, brightness);

    final Widget field = AnimatedContainer(
      duration: spec.transitionDuration,
      curve: spec.transitionCurve,
      decoration: BoxDecoration(
        color: spec.fillColor,
        borderRadius: spec.borderRadius,
        border: _focused ? spec.focusedBorder : spec.border,
        // `box-shadow: none` computes to a shadow with nothing about it, and
        // that is what the ring eases away to: with `null` at rest the first
        // tween would snap the spread on rather than grow it.
        boxShadow: <BoxShadow>[_focused ? spec.ring : spec.restRing],
      ),
      child: TextField(
        controller: widget.controller,
        focusNode: _focusNode,
        autofocus: widget.autofocus,
        obscureText: widget.obscureText,
        keyboardType: widget.keyboardType,
        textInputAction: widget.textInputAction,
        onChanged: widget.onChanged,
        onSubmitted: widget.onSubmitted,
        maxLines: 1,
        style: spec.textStyle,
        cursorColor: spec.textColor,
        decoration: InputDecoration(
          hintText: widget.hintText,
          hintStyle: spec.hintStyle,
          isDense: true,
          filled: false,
          contentPadding: spec.padding,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          errorBorder: InputBorder.none,
          focusedErrorBorder: InputBorder.none,
          disabledBorder: InputBorder.none,
        ),
      ),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      // `flex flex-col` with no `align-items` stretches both children, which is
      // how `.input { width: 100% }` fills its wrapper.
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (labelSpec != null) ...<Widget>[
          // CSS applies `text-transform` after layout, so the string a screen
          // reader reads on the web is the one the author wrote. Here the case is
          // part of the paint, and [AppLabelSpec.transform] is where the
          // measurement says to apply it.
          //
          // `<label for>` also makes the label a second way into the field: a tap
          // on it focuses the input. Opaque because the label element is the whole
          // stretched row, not only the glyphs on it.
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _focusNode.requestFocus(),
            child: Text(
              labelSpec.transform(label!),
              style: labelSpec.textStyle,
            ),
          ),
          SizedBox(height: AppFields.labelGap),
        ],
        field,
      ],
    );
  }
}
