import { GLOBAL_STYLES } from "./components/shared/constants";

import Nav              from "./components/Nav";
import Hero             from "./components/Hero";
import Product          from "./components/Product";
import Problem          from "./components/Problem";
import Approach         from "./components/Approach";
import DashboardPreview from "./components/DashboardPreview";
import FeatureDive      from "./components/FeatureDive";
import Integrations     from "./components/Integrations";
import Pareto           from "./components/Pareto";
import PdfReports       from "./components/PdfReports";
import Security         from "./components/Security";
import Faq              from "./components/Faq";
import FinalCta         from "./components/FinalCTA";
import Footer           from "./components/Footer";
import Pricing          from "./components/Pricing";

export default function Page() {
  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <Nav />
      <main>
        <Hero />
        <Product />
        <Problem />
        <Approach />
        <DashboardPreview />
        <FeatureDive />
        <Integrations />
        <Pricing />
        <Pareto />
        <PdfReports />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
