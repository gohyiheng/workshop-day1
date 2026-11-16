import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { Link } from './links-api.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createLoadedFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/links').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('rejects invalid schemes before making a create request', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;

    app.form.controls.url.setValue('ftp://example.com/file');
    app.submit();

    expect(app.form.controls.url.hasError('httpUrl')).toBeTrue();
    http.expectNone((request) => request.method === 'POST');
  });

  it('creates a link and refreshes the links table', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;
    const link: Link = {
      code: 'a1B2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    app.form.controls.url.setValue(link.url);
    app.submit();

    const createRequest = http.expectOne('/api/links');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ url: link.url });
    createRequest.flush(link);
    http.expectOne('/api/links').flush([link]);
    fixture.detectChanges();

    expect(app.createdLink()).toEqual(link);
    expect(fixture.nativeElement.textContent).toContain(link.shortUrl);
    expect(fixture.nativeElement.textContent).toContain(link.url);
  });

  it('shows API validation errors beside the URL field', () => {
    const fixture = createLoadedFixture();
    const app = fixture.componentInstance;

    app.form.controls.url.setValue('https://example.com');
    app.submit();
    http.expectOne('/api/links').flush(
      { error: 'url must be a valid HTTP(S) URL' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(app.submitError()).toBe('url must be a valid HTTP(S) URL');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent)
      .toContain('url must be a valid HTTP(S) URL');
  });
});
