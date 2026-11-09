# Optional Mushafi support — integration status

The support UI, all five languages, amount selection, explicit optional-development-support disclosure, header shortcut and visit cadence are implemented. The current signed artifact is an **owner preview**, not a public release. No money can be collected: `APP_SUPPORT_CHECKOUT.enabled` is false, the activation key is empty, no checkout adapter is defined, and automatic prompts are gated off.

## Merchant setup still required

The owner needs an approved payment-provider account and a public hosted checkout/payment-link capability supporting the intended Saudi-riyal amounts and digital wallets. No private keys or merchant identity documents should be pasted into chat or bundled in the APK.

When the provider is chosen, implement the provider-specific checkout adapter and native external navigation. Create/validate the amount and currency on the trusted payment side, verify the receipt through the provider's documented confirmation mechanism, and never treat clicking the support button or returning from checkout as proof of payment. Support does not unlock features or create paid entitlements. Wallet brand availability must reflect the selected provider and device.

## Prompt cadence

Only after checkout activation, use a stable activation key across subsequent app releases. The local UI ledger begins at the first configured foreground entry and displays on entries 1, 4, 7, etc.; repeated home navigation or calls in the same entry do not count again. Native foreground identities exclude external Activities and configuration recreation. Automatic presentation waits for the home screen, completed onboarding/tour, no existing sheet and no focused input. Manual presentation consumes the current entry's prompt. Corrupt/unwritable storage suppresses automatic presentation.

Public 3.1.24 and its update feed have not been modified. The preview reserves version code 175; use a higher version code for the next general release so an owner who installs the preview can update normally.
