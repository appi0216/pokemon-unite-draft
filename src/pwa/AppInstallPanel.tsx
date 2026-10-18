import { Download, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { checkForUpdates, installApp, retryOffline, usePwaStatus } from "./runtime";
import "./install.css";

export function AppInstallPanel() {
  const status = usePwaStatus();
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mac = !ios && /Mac/.test(navigator.platform);
  const android = /Android/.test(navigator.userAgent);
  return (
    <section className="pwa-panel" aria-label="アプリとオフライン">
      <h3>
        <Smartphone size={18} aria-hidden="true" />
        アプリとして使う
      </h3>
      {status.standalone ? (
        <p>アプリで起動しています。</p>
      ) : status.installed ? (
        <p>アプリを追加しました。ホーム画面やアプリ一覧から開けます。</p>
      ) : status.installRequested ? (
        <p>
          ブラウザーで追加を受け付けました。インストールの完了をお待ちください。
        </p>
      ) : status.canInstall ? (
        <button type="button" onClick={() => void installApp()}>
          <Download size={18} aria-hidden="true" />
          アプリを追加
        </button>
      ) : (
        <p>
          {ios ? (
            <>
              共有メニューの「ホーム画面に追加」を選びます。「ウェブアプリとして開く」がある場合はオンにしてください。項目がない場合はSafariで開けます。
            </>
          ) : mac ? (
            <>
              Safariの「ファイル」→「Dockに追加」（macOS
              14以降）。Chrome・Edgeではブラウザーのインストールメニューを使えます。
            </>
          ) : android ? (
            <>
              ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。
            </>
          ) : (
            <>
              Chrome・Edgeのアドレスバーやメニューからアプリをインストールできます。項目がない場合もブラウザーで利用できます。
            </>
          )}
        </p>
      )}
      <div className="pwa-offline" role="status">
        <WifiOff size={16} aria-hidden="true" />
        <span>
          {status.offline === "ready"
            ? "オフラインで利用できます"
            : status.offline === "preparing"
              ? "オフライン用データを準備中…"
              : status.offline === "unavailable"
                ? "オフライン用データを保存できませんでした"
                : "この環境ではオンラインで利用できます"}
        </span>
        {status.offline === "unavailable" && (
          <button
            type="button"
            onClick={() => void retryOffline()}
            disabled={!status.online}
          >
            <RefreshCw size={16} aria-hidden="true" />
            再試行
          </button>
        )}
      </div>
      <p className="pwa-note">利用中の版：{__BUILD_ID__}</p>
      <button type="button" onClick={() => void checkForUpdates()} disabled={!status.online || status.updateCheck === "checking"}>
        <RefreshCw size={16} aria-hidden="true" />更新を確認
      </button>
      <p className="pwa-note" role="status">
        {!status.online ? "オフラインのため更新を確認できません。" : status.updateCheck === "checking" ? "更新を確認中…" : status.updateCheck === "failed" ? "更新を確認できませんでした。通信を確認して再試行してください。" : status.updateCheck === "checked" && !status.updateReady ? "更新を確認しました。新しい版が準備されると案内します。" : ""}
      </p>
      {status.updateReady && (
        <p className="pwa-note">
          更新があります。「未保存」と表示されている場合は保存を再試行してください。保存後、このアプリのタブとウインドウをすべて閉じ、開き直すと反映されます。
        </p>
      )}
      <p className="pwa-note">
        初回は通信が必要です。保存したドラフトは、このブラウザーやアプリ内に残ります。
      </p>
    </section>
  );
}
