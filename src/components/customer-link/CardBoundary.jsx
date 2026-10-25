/**
 * Catches a customer card that cannot be drawn: its code could not be fetched (a flaky connection, a tab left open across a deploy) or
 * something inside it threw. The provider that draws the card sits above the page's own error screen, so without this a failure here
 * would blank the whole app instead of one card. It says so in a small dialog and closes.
 */
import { Component } from "react";
import Modal from "../Modal";

export default class CardBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err) {
    console.error("The customer card could not be opened:", err);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { name, onClose } = this.props;
    return (
      <Modal title={name || "Customer"} size="sm" glass onClose={onClose} footer={<button type="button" className="primary-button" onClick={onClose}>OK</button>}>
        <p className="cl-note cl-note--err" role="alert">This customer could not be opened. Check the connection and try again.</p>
      </Modal>
    );
  }
}
