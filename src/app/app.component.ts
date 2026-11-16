import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { Link, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return control.value ? { httpUrl: true } : null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly linksApi = inject(LinksApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly links = signal<Link[]>([]);
  readonly createdLink = signal<Link | null>(null);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly form = this.formBuilder.group({
    url: ['', [Validators.required, httpUrlValidator]]
  });

  ngOnInit(): void {
    this.refreshLinks();
  }

  submit(): void {
    if (this.isSubmitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const url = this.form.controls.url.value.trim();
    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.createdLink.set(null);

    this.linksApi.createLink(url).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isSubmitting.set(false))
    ).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.refreshLinks();
      },
      error: (error: unknown) => this.submitError.set(this.errorMessage(error))
    });
  }

  private refreshLinks(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.linksApi.getLinks().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (links) => this.links.set(links),
      error: (error: unknown) => this.loadError.set(this.errorMessage(error))
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error;
      if (typeof message === 'string') return message;
      if (error.status === 0) return 'Could not reach the Snip API. Check that the backend is running.';
    }

    return 'Something went wrong. Please try again.';
  }
}
